// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO TAKES PART, AND THE PICTURES THEY ARE DRAWN WITH.
 *
 *   GET   /api/participants                        both registries, with the address of each picture
 *   GET   /api/participants/:kind/:id              one person or one durable agent
 *   PATCH /api/participants/:kind/:id              change a name or a state
 *   POST  /api/participants/:kind/:id/avatar       send a picture, or go back to the drawn one
 *   PUT   /api/participants/:kind/:id/address-as   say how you wish to be addressed
 *   GET   /api/assets/:id                          the bytes of one picture
 *   GET   /api/avatars                             the pictures this product offers, by name
 *   GET   /api/avatars/:set/:name                  the bytes of one of those
 *
 * Criteria M2 and M3 of design/messages/ACCEPTANCE.md, part 2a. The rules about who may change what
 * are in src/server/lib/participants.ts, beside the refusals that name them; nothing here repeats
 * one, so a rule cannot be enforced differently at the door and in the library.
 *
 * ---------------------------------------------------------------------------------------
 * A PICTURE ARRIVES AS BASE64 IN A JSON BODY, AND THAT IS A DECISION
 * ---------------------------------------------------------------------------------------
 *
 * There is no multipart parser in this server and no dependency that gives one. Every other write in
 * this product is a JSON body, `src/web/api.ts` sends exactly one kind of request, and adding a form
 * parser would be a second shape of write for one route. Base64 costs a third more bytes on the wire
 * over a loopback connection, which is not a cost worth a dependency.
 *
 * THE BODY LIMIT IS READ FROM THE SAME SETTING THE SIZE CHECK USES, at registration, with the third
 * added back on and room to spare. The room to spare is the point. Base64 inflates a picture by
 * exactly four thirds, so a body limit set to the setting plus a third lands on the same picture
 * size as the size check — and then whichever runs first decides what a person reads. Fastify runs
 * first, and its sentence names neither number. The body limit is therefore several times the
 * setting, so that an oversize picture reaches `storeUploadedAvatar` and is refused in this
 * product's own words. Problem `dTf3LgcTj78w` is what this window being 3 KB wide looked like.
 *
 * A BODY PAST EVEN THAT IS REFUSED HERE, IN A SENTENCE OF OUR OWN. Fastify's own refusal never
 * reaches a caller of this route: `errorHandler` below turns it into one that says how big a
 * picture may be and which setting holds the number.
 *
 * ---------------------------------------------------------------------------------------
 * NEITHER `:id` HERE IS A RECORD ID
 * ---------------------------------------------------------------------------------------
 *
 * A participant and a picture belong to the installation and not to a project, so there is no
 * cross-project id to refuse and no workspace header to read. `tests/by-id-boundary.test.ts` holds
 * every route with a parameter to saying which of those two it is, and these are named there.
 */

import { nothingWrittenSentence } from '../lib/records/patching.ts'
import { agentMarksFor, keepPersonalAgentTags, personalAgentTags } from '../lib/agent-tags.ts'
import { projectsOfAgent } from '../db/projects-of-agents.ts'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { isMessagePictureChoice, type MessagePictureChoice } from '@shared/messagepictures.ts'
import { PAGE_SHAPE, PAGE_SHAPE_REFUSAL } from '@shared/short-lists.ts'
// WHETHER MEDIA A RECORD POINTS AT ARE LOADED. Criterion U5. NOT `messagepictures.ts` above: that is
// a picture inside a chat message.
import { isMediaLoadChoice, type MediaLoadChoice } from '@shared/mediaload.ts'
import { theClockZone } from '@shared/time.ts'
import {
  isMoleOffice,
  MOLE_OFFICES_OWN_ROW_SAYS_OF_ITS_CARD,
  theMoleOfficeTest,
  PARTICIPANT_KINDS,
  defaultAvatarAssetId,
  isChatButtonStays,
  isChatOpensAs,
  isChatLayout,
  isChatTextSize,
  isSendKeySetting,
  readShortcutSettings,
  LANGUAGES,
  isLanguage,
  type Language,
  isCircleShows,
  isMessageLinkLayout,
  isMessageProjectMark,
  isMessageLinkLevel,
  admittedBeforeP88,
  admittedBeforeP88Says,
  participantWord,
  type ChatButtonStays,
  type ChatOpensAs,
  type ChatLayout,
  type ChatTextSize,
  type CircleShows,
  type MessageLinkLayout,
  type MessageProjectMark,
  type MessageLinkLevel,
  type ParticipantRef,
  type SendKeySetting,
  type ShortcutSettings,
  whyThatIsNotAHandle,
} from '@shared/participants.ts'
import { isAnUnreadableMessageLabels, readMessageLabels, type TheStoredMessageLabels } from '@shared/message-label.ts'
import { readShippedFlags, type StoredShippedFlags } from '@shared/intent-mark.ts'
import { actorFrom, refuseTheOldWarrantHeader, UnprovedIdentityError, workspaceFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { WORKSPACE_HEADER } from '@shared/request-headers.ts'
// HOW A PERSON OR AN AGENT WISHES TO BE ADDRESSED, declared once.
import {
  ADDRESS_AS_PARTS,
  ADDRESS_AS_PART_MAX_CHARACTERS,
  readTheAddressAsSent,
  WHAT_ADDRESS_AS_MEANS,
  type AddressAs,
  type AddressAsPart,
  type AddressAsSetBy,
} from '@shared/address-as.ts'
// P95's AREA OVERLAP USES THE CLAIM FILE'S GROUP-OPENING CORE, so nothing writes a second overlap
// mechanism. It is called by the two doors that write an area, after the write, and it refuses
// nothing; it opens a group and says so.
import { openTheGroupsForAWorkArea } from '../lib/claims.ts'
// THE ONE MESSAGE A NEW AGENT GETS ABOUT THE CARD IT NOW HOLDS.
import { writeTheCardMessageToOne } from '../lib/cardmessage.ts'
import { sayItWasDoneFromAnotherComputer } from '../lib/changed-from-another-computer.ts'
import { checkAgentNotes, createRecordWithReport, getRecord, listRecords, patchRecord, sameAgent, throughTheCardDoor, throughTheRetireDoor, writeDownASettingChange, writeDownAnActUnderTheRaise, type Actor } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
// THE KEY A REGISTRATION ANSWERS, ONCE. Criterion P83, point 5: made here, kept only as its
// SHA-256, answered in the reply and never read back. The retire door revokes it in the same act.
import {
  THE_AGENT_KEY_IS_SHOWN_ONCE,
  aKeyWasEverHeldBy,
  howThisRequestProvedItself,
  makeAnAgentKey,
  revokeEveryLiveKeyHeldBy,
} from '../lib/keys.ts'
import { theHashOfTheKeyOnThisRequest } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { gateMet } from '../lib/gate-counts.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { requireWorkspace } from '../lib/require-workspace.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { EVERY_PROJECT } from '@shared/which-projects.ts'
import {
  validateWorkArea,
  changeWorkArea,
  changeFilesArea,
  theFilesAreaOf,
  changeBroadcastTimes,
  sayASlotHasNothingToReport,
  changeStartFolder,
  agentsStartingIn,
  type AStarter,
  type RegisteredAgent,
  type WhatTheCallerIsDoing,
  retireThisAgent,
  whoMayRetire,
  whyThisIsNotYoursToRetire,
  setParticipantAddressAs,
  whyThisAddressAsWriteIsRefused,
  setReadsReleasesFromTheCheck,
  theReleaseReadingOf,
  setParticipantAvatar,
  setParticipantName,
  setParticipantCircle,
  setParticipantCirclePicture,
  setParticipantMessageLinkLayout,
  setParticipantMessageProjectMark,
  setParticipantMessagePictures,
  setParticipantMediaLoad,
  setParticipantChatTextSize,
  setParticipantChatButtonStays,
  setParticipantChatOpensAs,
  setParticipantChatLayout,
  setParticipantSendKey,
  setParticipantShortcuts,
  setParticipantChatLabels,
  setParticipantShippedFlags,
  setParticipantLanguage,
  sayYouStartedThisAgent,
  setThePersonsCard,
  setWhatIsOnTheirCard,
  setParticipantMessageLinkLevel,
  setParticipantPresence,
  setParticipantState,
  theAgentsNewerThanASameNamedOne,
} from '../lib/participants.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { theAgentAStoredIdNames } from '../lib/the-agent-a-stored-id-names.ts'
import { theAgentAStoredReferenceNamesIn } from '../lib/the-agent-a-stored-reference-names-in.ts'
import { theChainUpWith } from '@shared/the-chain-up-with.ts'
import { theStarterEachStringNames } from '../lib/the-starter-each-string-names.ts'
import { whyTheChangeIsRefused } from '@shared/why-the-change-is-refused.ts'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { recordForAgentIn } from '../db/record-for-agent-in.ts'
import { recordsForAgentsIn } from '../db/records-for-agents-in.ts'
// THE ONE STANDING GROUP FOR THE OWNER AND EVERY SECRETARY. Every door that can change which card
// an agent holds calls this after its own write, so the group follows the registry and no door has
// its own rule about who belongs.
import { bringTheSecretariatGroupInStep, syncTheSecretariatGroup } from '../lib/secretariat.ts'
// AND THE BROADCAST SCHEDULE THAT FOLLOWS THE SAME CARD.
import { bringTheBroadcastSchedulesInStep, syncTheBroadcastSchedules, theBroadcastReadingFor, theBroadcastScheduleIsHeldFor, type BroadcastReading } from '../lib/broadcast.ts'
import {
  avatarOfferedTo,
  avatarsOnOffer,
  circlePictureBytes,
  isAvatarSetName,
  maxAvatarBytes,
  offeredAvatarBytes,
  pictureShownFor,
  storeAvatarUpload,
  theAvatarToSend,
  type AvatarOnOffer,
} from '../lib/avatars.ts'
import { openToSend, sendTheOpenFile } from './files.ts'
import { circlePicture, participantFromKey, theReasonAsOneSentence } from '@shared/messages.ts'
import { PROPOSED_NAMES } from '@shared/participants.ts'
// WHAT A ROW WITH NO ROLE IS READ AS, and what a screen says instead of drawing that word. Both
// come from shared/roles.ts, which is where the role vocabulary's one statement of each fact is.
import {
  A_PERSON_WITH_NO_ROLE_READS_AS,
  A_ROW_WITH_NO_ROLE_READS_AS,
  theMarkSaying,
  whoChoseTheCardSays,
  theWorkAreaMarkSaying,
  theWorkAreaOverlapSaying,
  theWorkAreaOverlapSays,
  aWorkAreaBeforeTheRule,
  aWorkAreaBeforeTheRuleSays,
  type WhoChoseTheCard,
  type WhoRegisteredTheWorkArea,
  NO_ROLE_SET,
  cardFor,
  isARole,
  mayBeElevated,
  personCardFor,
  theRoleWordsSaid,
  theStandingLineFor,
  whyThisRoleMayNotBeGiven,
  type RolesDeclaration,
} from '@shared/roles.ts'
// WHERE A CARD'S OWN PICTURE IS SERVED. Criterion P71 draws the card on a citizen's page, and this
// is the same rule the Role cards page and the copier read, so one card is one picture everywhere.
import { theFirstPortraitOf } from '@shared/portraits.ts'
// THE CARDS THIS SERVER STARTED WITH. Read once in buildApp; asking for them here never touches a
// disk, and asking before the boot has read them throws rather than reading a second copy.
import { theRoleCards } from '../lib/roles.ts'
import { theCardInTheOfficesWords } from '../lib/the-card-in-the-offices-words.ts'
// THE ADDRESS A STARTED AGENT WRITES TO, from the one declaration the server and Vite both read. It
// is not built here: a tool that had this address wrong filed a session into the wrong database.
import { settings } from '../../config/settings.mjs'
// THE HEADER A KEY TRAVELS ON, declared once beside the key it carries. A copy here could spell a
// header the server never reads and nothing would fail until a registration arrived unproved.
import { KEY_HEADER } from '../../config/key-header.mjs'
import type { CitizenOf, ProfileFacts, TheCardDrawn, TheCardTheyHold, WaitingCardAsk } from '@shared/profile.ts'
import type { LoginsWeek } from '@shared/logins-week.ts'
import { theLoginsWeekForASecretary } from '../lib/logins-week.ts'
import type { OneOfItsRuns } from '@shared/profile.ts'
import { VISITS_SAY, SEEN_FROM_SAYS, FILED_LATELY_SAYS, CITIZENSHIP_SAYS, theNameASelfRegistrationIsReadBy } from '@shared/profile.ts'
import { saying, inEnglish, type DevSaying } from '@shared/dev-sayings.ts'
// THE RUNS THIS AGENT WORKED AS, read through `ranAs`. Criterion P91. The one reader, so the page
// and the tests cannot come to different totals or a different binding.
import { theAgentsRuns } from '../lib/agent-runs.ts'
// WHAT A RETIRE IS REFUSED WHILE A CHECK OR A REPORT IS STILL OWED, and the sentence that says
// so. The reading and the sentence live beside `whereARunStands`, so the door
// and GET /api/checks answer the same question the same way.
import { whatRetiringWhileACheckIsOwed, theRetireSentenceWhileACheckIsOwed } from '../lib/inspection.ts'
// WHETHER THIS AGENT IS ACTING FOR THE PERSON, read in the one place the Role cards page reads it.
// Criterion P64 put the press on this page, so the two replies must not answer it differently.
import { asAScreenReadsIt, whatThisAgentIsDoingForYou } from '../lib/actingfor.ts'
// THE ACTS MADE UNDER ONE PERIOD, and the last grant the person made. Criterion P19: the stamp is written
// by lib/records.ts and this is the one reader that asks the ledger back by the grant's id.
import { actsUnderThePeriod, theGrantEverMadeTo, type WhatTheRoutesSay } from '../lib/elevation.ts'
import { whatTheRoutesOfAnOperationSay, type ApiRoute } from './kinds.ts'
// WHETHER THIS REQUEST MAY REGISTER AN AGENT AT ALL. Criterion P69: registration from another
// machine needs a credential the person has confirmed. The record door asks the same function.
import { whereThisRegistrationCameFrom } from '../lib/registrationgate.ts'
// THE ROW ONE CREDENTIAL ALREADY HAS. Criterion P81's collision rule; the owner's case of 8 September 2026.
import { theRowThisCredentialAlreadyHas } from '../lib/participants.ts'
import { sqlite } from '../db/client.ts'
import { theFiledAliasesReadOnce, type TheFiledAliases } from '../lib/registry-aliases/runs.ts'
import { theOneAgentAStringNames } from '../lib/agent-references.ts'
// AN AGENT REGISTERED WITH NO KEY OF ITS OWN, marked in the registration's own transaction.
import { markAsSigningOnlyWithRunKeys } from '../lib/run-keys-only.ts'
import type { Visit } from '@shared/worlds.ts'
import { machinesSeenFrom, theStartFolderOf } from '../lib/participants.ts'
import { recentlyWritten } from '../lib/agentmemory.ts'
import { readTheChaptersNamed, theChaptersLineFor } from '../lib/chapters.ts'
import {
  asAContactToPlace,
  contactsFor,
  everybodyRegistered,
  whoHasInjectedTo,
  everyMessageHiddenFrom,
  theMessageReader,
} from '../lib/messages.ts'
import { whetherAgentsMayInject } from '../lib/inject-setting.ts'
import { groupsOf, placeTheContacts } from '../lib/contacts.ts'
import { participantPresence } from '../lib/presence.ts'
import { whoIsAnsweringAs } from '../lib/worker.ts'
import { theOfficeIsInThisDatabase, theWorldsThisWorldCanName, type AWorldNamed, type TheOfficesList } from '../lib/office.ts'
import { visitsHere } from '../lib/visits.ts'
import { theNotebookOnACardFor } from '../lib/notebook.ts'
// WHICH PROJECT A WORKING DIRECTORY IS IN, and whether the one-version window is open. The matching
// is the onboarding worker's shared file; the door holds no second copy. Criterion P83 point 6 and
// F15 point 2.
import { resolveProject } from '../lib/onboarding.ts'
import { theKeyWindowIsClosed } from '../db/the-key-window-is-closed.ts'
// WHAT AN AGENT LEFT UNFINISHED, read through the two readers that already answer it: the open
// loops of the project (`openLoopsFor`), put in the attention rule's order (`rankOpenWork`), and
// narrowed to the records this agent filed (`whoFiled`, the create row of the change log). F15
// point 4. Nothing here decides a second time what "open" means.
import { openLoopsFor, whoFiled } from '../lib/openloops.ts'
import { rankOpenWork, theReadingOpenWorkIsRankedBy, type RankedLoop } from '../lib/openwork.ts'
// HOW BIG THIS REPLY IS, in characters and bytes counted exactly and tokens estimated. The same
// declaration GET /api/brief and GET /api/onboarding read, so the three cannot say it differently.
import { CHARS_PER_TOKEN, theTokenEstimateSentence, tokensEstimatedFor } from '../../config/token-estimate.mjs'
// HOW A START FOLDER IS STORED, by part (c) of a decision;
// the one rule, read by this door, by the change door and by the record's own check.
import { theStartFolderAsItIsStored } from '../../config/start-folder.mjs'
import { resolve } from 'node:path'
import { CLOSED_BECAUSE, isClosedHow } from '@shared/lifecycle.ts'
import { THE_PERSON } from '@shared/person.ts'
import {
  aWaitingSelfRegistration,
  howItsKeyIsCollected,
  registerTheSessionItself,
  theWaitingMarker,
  whatAStartFolderDoes,
  type WhatASessionSaysAboutItself,
} from '../lib/selfregistration.ts'
// A DURABLE AGENT THAT LOST ITS KEY GETS A NEW ONE. It follows problem x8ktQfHS5yGr and a decision.
import { aOneTimeSecret, aStarterReKeysAnAgent, askForANewKey, collectAFirstKey, whatAJoinedRowIsAnsweredInsteadOfAKey, whatAPressOnThisAskDoes } from '../lib/newkey.ts'
import { howThisCallProvesTheKeyItMakes } from '../lib/provedkeys.ts'
import { theHandoverPartFor } from '../lib/handovers.ts'
import { theAskedFromMarker, whereThisAskCameFrom, type WhereAnAskCameFrom } from '../lib/where-an-ask-came-from.ts'
import { setTheLook, theLookForTheReader } from '../lib/the-look.ts'
import type { TheStoredLook } from '@shared/own-themes.ts'

// ============================================================================ the sentences

/**
 * WHAT `addressAs` ON A PARTICIPANT MEANS, said on every read that carries it.
 * Declared before the notes that end with it.
 */
const ADDRESS_AS_ON_THE_WIRE = ` \`addressAs\` is ${WHAT_ADDRESS_AS_MEANS}`

const LIST_NOTE =
  'BOTH REGISTRIES: the people of this installation and its durable agents. Each carries a name, the short handle ' +
  'somebody types to address it, the address of the picture it is drawn with, and the state it set itself — free ' +
  'text it wrote, with the moment it wrote it, or nothing at all because nobody has said. An agent also carries ' +
  'the runtime word that serves it, whether it has been retired and why. Neither registry belongs to a project: ' +
  'the same person and the same agent are in every project on this machine, so this route reads no workspace ' +
  'header. Whether anybody is reachable right now is NOT here and is never stored; it is worked out from what is ' +
  'running. ?shape=page answers the same people and agents with only the fields the pages read. Left out, every ' +
  'row is whole.' + ADDRESS_AS_ON_THE_WIRE

const READ_NOTE =
  'ONE PARTICIPANT, by kind and id — the only way a participant is ever named. `person` reads the people ' +
  'registry and `agent` reads the durable agents. Answers 404 naming what was asked for when no row answers to ' +
  'it, rather than an empty participant.' + ADDRESS_AS_ON_THE_WIRE

/** The participant rows do not require an identity; the person's look does. */
function theReaderOfAnOptionalLook(req: FastifyRequest): ParticipantRef | null {
  try {
    return participantForActor(actorFrom(req))
  } catch (error) {
    if (error instanceof UnprovedIdentityError && theHashOfTheKeyOnThisRequest(req) === null) return null
    throw error
  }
}

const ADDRESS_AS_NOTE =
  'SAY HOW YOU WISH TO BE ADDRESSED. Body {"name"?: …, "secondPerson"?: …, "thirdPerson"?: …, "title"?: …}, each ' +
  'free text. The body replaces the whole field: a part left out, sent as null or sent empty is stored as not set. ' +
  `Each part is trimmed, may be at most ${String(ADDRESS_AS_PART_MAX_CHARACTERS)} characters, and may hold no line ` +
  'break. A person sets their own, with a request proved to be them. An agent sets its own, with its own key sent ' +
  'as x-mole-office-key; a header naming the agent without its key is refused. The owner may set any agent\'s. A ' +
  'secretary, proved by its own key, may set anybody\'s, a person\'s or an agent\'s. ' +
  'Nobody else sets another\'s. While the gate who-sets-how-another-agent-is-addressed is off, any agent proved by ' +
  'its own key may also set another agent\'s, and is counted. Every refusal says who may set it, and a refused ' +
  'request writes nothing. The row records who set it and when, as addressAsSetBy. The values are shown back as ' +
  'written and are never translated.'

const CHANGE_NOTE =
  'CHANGE A NAME, A STATE OR WHETHER A PERSON IS HERE. Body {"name"?: …, "state"?: …, "presence"?: …} and at ' +
  'least one of them. `presence` is only a person\'s, is one of online, offline or invisible, and is set by that ' +
  'person and by nobody else; sending an empty one puts it back to nobody having chosen, which reads as online. ' +
  'An agent is refused it, because whether an agent can be reached is worked out from what is running. A person may ' +
  'change any agent\'s name and their own here, at once, to a name no other live agent bears. An agent changes no name ' +
  'here: a new name for an agent is proposed at POST /api/participants/agent/:id/renames, and it takes effect when the ' +
  'agent\'s approver approves it. ' +
  'Beside a name, `nameBecause` is the person\'s reason for an agent\'s new name. An agent the person renames here gets one row in its rename history, with the person as proposer and approver. ' +
  'A person\'s own line is theirs alone. An agent\'s line may be set or cleared by the agent itself or by a ' +
  'person, and the reply says which of them did. The line is a working ' +
  'mark and not whether anybody is online. AN AGENT\'S LINE IS AT MOST 60 CHARACTERS LONG, and a longer one is ' +
  'refused naming its length: this is the limit the route enforces, stated here so nobody learns it from the ' +
  'refusal. One agent may never write on another. Sending an empty state clears ' +
  'it back to nobody has said, and clears the time and the setter with it. Every refusal names the rule it is, ' +
  'in one sentence.'

const PROFILE_NOTE =
  'ONE PARTICIPANT\'S WHOLE PAGE, IN ONE READ. The registry row, whether they can be reached right now, the ' +
  'contact group the caller has them in, the world this database\'s roll says they are a citizen of, every trip ' +
  'this world holds a row for, the machines their requests arrived from, and — for an agent — whether a session ' +
  'is answering as it, what it filed in this project lately, and the short name proposed for it. Eight routes ' +
  'answer parts of this and a page calling all of them would read eight clocks; this reads one. Every field that ' +
  'can be absent for more than one reason carries a sentence saying which reason it was, so a reader is never ' +
  'left to tell "there is none" from "nobody could look". Agent-only fields are null on a person, which means ' +
  'there is nothing to say rather than nothing to show.' + ADDRESS_AS_ON_THE_WIRE

const RESTORE_NOTE =
  'AN AGENT’S OWN CONTEXT, RESTORED BY WHO IT IS: how it wishes to be addressed, the card it holds and what it may do, the project it ' +
  'works in and how that was worked out, the open work it filed there, the last session that ran as it, ' +
  'and what changed since that session ended. Send the agent’s own key as x-mole-office-key to ' +
  'GET /api/restore, or name the agent in the path at GET /api/restore/:handle; a request carrying a ' +
  'key and a handle that is somebody else’s is refused naming both, and a key nobody holds answers that ' +
  'nobody holds it and names no agent. THE PROJECT IS THE ONE THE REQUEST NAMED, or the one a working ' +
  'directory matched, and it never falls back to the default: a project that could not be worked out is ' +
  'said so and none is named. Every absence is said as an absence — an agent nobody has run as is told ' +
  'that, which is not the same sentence as nothing has changed. It measures its own size in characters ' +
  'and in estimated tokens, and names in `leftOut` anything it dropped to stay inside its budget.' + ADDRESS_AS_ON_THE_WIRE

const AVATAR_NOTE =
  'SEND A PICTURE, OR GO BACK TO THE ONE MOLE OFFICE DREW. Body {"bytes": "<base64>"} for a picture, or ' +
  '{"reset": true} to point back at the drawing made from this participant\'s id, which is still there. A person ' +
  'may change any agent\'s picture and their own; an agent may change its own and no other. The bytes are read ' +
  'to find out what the file really is — png, jpeg or webp — rather than the type being taken from what was ' +
  'sent, and an SVG is refused because a browser runs it. The size limit is MOLE_OFFICE_AVATAR_MAX_BYTES and the ' +
  'refusal says both numbers. The stored file goes beside the database and never into the repository.'

const ON_OFFER_NOTE =
  'THE PICTURES THIS PRODUCT OFFERS, so a person picks one instead of finding a file on a disk. Two sets: ' +
  '`drawn`, the animals drawn by hand for Mole Office, and `generated`, the ones an image model made. Each ' +
  'picture carries its set, its name and where its bytes are. THIS GIVES NOBODY A PICTURE: to use one, fetch ' +
  'its bytes and send them to POST /api/participants/:kind/:id/avatar, which is the same request a file chosen ' +
  'from a disk makes, so the rules about who may change whose picture stay in one place. The list is read off ' +
  'the files in this checkout on every request, so a picture added to the set is offered without anything ' +
  'being edited. A missing directory is reported as that and never answered as an empty set. ASK `?for=` WITH ' +
  'A PARTICIPANT — `agent:aGtx…`, `person:owner` — and the reply also carries `offered`: the one drawn picture ' +
  'offered to a participant nobody has ever chosen a picture for, worked out from their id so it is the same ' +
  'every time. It is null when somebody has already chosen one. Nothing is written either way: criterion M30 ' +
  'asks that an agent with no picture is OFFERED one, and a person presses it.'

const ON_OFFER_BYTES_NOTE =
  'THE BYTES OF ONE PICTURE ON OFFER, by its set and its name, both from GET /api/avatars. The bytes are read ' +
  'to find out what the file really is, exactly as an upload\'s are, so a file in that directory that is not a ' +
  'png is refused rather than served under a type nobody checked. A browser may keep one for an hour: unlike a ' +
  'picture somebody uploaded, these files change when somebody edits a drawing.'

const ASSET_NOTE =
  'THE BYTES OF ONE PICTURE. A picture Mole Office drew is worked out from the participant it belongs to and comes ' +
  'back as an SVG; one somebody uploaded comes back as the file. An uploaded picture whose file is missing is ' +
  'reported as missing and NOTHING is drawn in its place — an archive carries the row and never the file, so a ' +
  'restored copy really reaches that state and a stand-in would be a lie about whose picture this is.'

const CIRCLE_PICTURE_NOTE =
  'THE BYTES OF ONE PICTURE THE ROUND CHAT BUTTON MAY CARRY, criterion M38. Four of them, kept from the candidates ' +
  'the owner was shown on 4 September 2026: mole-at-the-sill, three-moles-at-the-sill, mole-in-a-porthole, ' +
  'two-moles-talking. Two come back as drawings and two as pictures, because a drawing made at 48 pixels is crisp ' +
  'at the size this button is drawn and a photograph made at 512 is not. THESE ARE NOT AVATARS: they belong to the ' +
  'product and to nobody, so they are not in the sets GET /api/avatars offers and no participant can be given one. ' +
  'Which of them a person has chosen is on their registry row and is changed at PATCH /api/participants.'

// ============================================================================ what a caller may send

const changeBody = z
  .object({
    name: z.string().optional(),
    /** Why the person gives an agent this name, kept on the agent's rename row (item 42). Only beside a name. */
    nameBecause: z.string().trim().min(1, 'A reason for a name is words; send none to give no reason.').optional(),
    state: z.string().optional(),
    stateWas: z.string().nullable().optional(),
    presence: z.string().optional(),
    /** How the number on the chat circle is drawn, criterion M32. A person's own and nobody else's. */
    circle: z.string().optional(),
    /** Which picture the round chat button carries, criterion M38. A person's own too. */
    circlePicture: z.string().optional(),
    /** Which name a record named in a message is drawn under, criterion M47. A person's own too. */
    messageLinkLevel: z.string().optional(),
    /** How that link is laid out in the bubble, criterion M48. A person's own too. */
    messageLinkLayout: z.string().optional(),
    /** Whether a message says which project it is in, criterion M73. A person's own too. */
    messageProjectMark: z.string().optional(),
    /** How a picture in a message is drawn, criterion M64 and decision rJphPkCG3l7X. A person's own. */
    messagePictures: z.string().optional(),
    /**
     * Whether media a record points at are loaded, criterion U5. A person's own, and a different
     * setting from the one above it: that one is a picture inside a chat message.
     */
    mediaLoad: z.string().optional(),
    /** How big the chat's own text is, criterion M112. A person's own too. */
    chatTextSize: z.string().optional(),
    /** When the chat circle shows, `when-unread` or `always`. A person's own too. */
    chatButtonStays: z.string().optional(),
    /** How the chat opens, `split` or `window`. A person's own too. */
    chatOpensAs: z.string().optional(),
    /** A person's choice of one or two columns, or an empty string to clear it. */
    chatLayout: z.string().refine(value => value.trim() === '' || isChatLayout(value.trim()), {
      message: 'Choose one or two columns. Nothing was written.',
    }).optional(),
    /** Which key sends a message. A person's own too. */
    sendKey: z.string().optional(),
    /**
     * Which keyboard shortcuts are on, by item 5 of a decision.
     * A person's own too. Read here,
     * before any setter runs, so a wrong value is refused with nothing written; null clears it.
     */
    shortcuts: z
      .unknown()
      .superRefine((value, ctx) => {
        if (value === null || value === undefined) return
        const read = readShortcutSettings(value)
        if (!read.ok) ctx.addIssue({ code: 'custom', message: `${read.why} Nothing was written.` })
      })
      .optional(),
    /**
     * The person's own labels for the messages they write, migration 0341. A person's own too, read
     * here as the shortcuts are, so a wrong list is refused with nothing written; null clears it.
     */
    chatLabels: z
      .unknown()
      .superRefine((value, ctx) => {
        if (value === null || value === undefined) return
        const read = readMessageLabels(value)
        if (!read.ok) ctx.addIssue({ code: 'custom', message: `${read.why} Nothing was written.` })
      })
      .optional(),
    /**
     * The person's own settings for the two shipped flags and 'No mark', migration 0346. A person's own, read here as
     * the labels are, so a wrong value is refused with nothing written; null puts every default back.
     */
    shippedFlags: z
      .unknown()
      .superRefine((value, ctx) => {
        if (value === null || value === undefined) return
        const read = readShippedFlags(value)
        if (!read.ok) ctx.addIssue({ code: 'custom', message: `${read.why} Nothing was written.` })
      })
      .optional(),
    /**
     * The person's look and their own themes, migration 0347. Theirs alone. Read by `setTheLook` in
     * lib/the-look.ts rather than here, so a caller who may not set it is told that first; null clears it.
     */
    themes: z.unknown().optional(),
    // Check the word before any setter runs, including when this also changes a name.
    language: z.string().trim().refine((word) => word === '' || isLanguage(word), {
      message: `Choose ${Object.keys(LANGUAGES).join(', ')}, or an empty string to follow the browser. Nothing was written.`,
    }).optional(),
    /** What they do, in their own words, criterion P45. A person's own, and nothing checks it. */
    occupation: z.string().optional(),
    /** Which portrait is on their card, criterion P47. A person's own; empty puts it back to none. */
    portrait: z.string().optional(),
    /** Which card a person holds, criterion P46. The rule is on `setThePersonsCard`. */
    role: z.string().optional(),
    /**
     * SAY YOU STARTED THIS AGENT. The only value is "me": a person names themselves and nobody else,
     * because a starter has to have agreed to answer for the agent and writing your own name is that
     * agreement. See `sayYouStartedThisAgent`.
     */
    startedBy: z.literal('me').optional(),
  })
  .strict()
  .refine(body => body.stateWas === undefined || body.state !== undefined, { message: 'An expected line needs a state to write.' })
  .refine(body => body.nameBecause === undefined || body.name !== undefined, { message: 'A reason for a name needs a name to write.' })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.state !== undefined ||
      body.presence !== undefined ||
      body.circle !== undefined ||
      body.circlePicture !== undefined ||
      body.messageLinkLevel !== undefined ||
      body.messageLinkLayout !== undefined ||
      body.messageProjectMark !== undefined ||
      body.messagePictures !== undefined ||
      body.mediaLoad !== undefined ||
      body.chatTextSize !== undefined ||
      body.chatButtonStays !== undefined ||
      body.chatOpensAs !== undefined ||
      body.chatLayout !== undefined ||
      body.sendKey !== undefined ||
      body.shortcuts !== undefined ||
      body.chatLabels !== undefined ||
      body.shippedFlags !== undefined ||
      body.themes !== undefined ||
      body.language !== undefined ||
      body.occupation !== undefined ||
      body.portrait !== undefined ||
      body.role !== undefined ||
      body.startedBy !== undefined,
    {
      message:
        'needs a language or a name, a state, a presence, a circle, a circlePicture, a messageLinkLevel, a messageLinkLayout, a ' +
        'messageProjectMark, a messagePictures, a mediaLoad, a chatTextSize, a chatButtonStays, a chatOpensAs, a chatLayout, a sendKey, ' +
        'shortcuts, chatLabels or shippedFlags to change; it was sent ' +
        'none of them, so nothing would have happened',
    },
  )

/**
 * THE BODY OF THE ADDRESS-AS DOOR: one optional entry per part declared in src/shared/address-as.ts,
 * built from that list so a part cannot be declared there and missed here. A string or null; the
 * reading of each value is `readTheAddressAsSent`'s.
 */
const addressAsBody = z
  .object(
    Object.fromEntries(ADDRESS_AS_PARTS.map((part) => [part, z.string().nullable().optional()])) as Record<
      AddressAsPart,
      z.ZodOptional<z.ZodNullable<z.ZodString>>
    >,
  )
  .strict()

const avatarBody = z
  .union([
    z.object({ bytes: z.string().min(1) }).strict(),
    z.object({ reset: z.literal(true) }).strict(),
  ])
  .describe('either the picture, base64 encoded, or a request to go back to the drawn one')

const whoIsBeingOfferedOne = z
  .object({
    for: z.string().min(1).optional(),
  })
  .strict()

const whichPictureOnOffer = z
  .object({
    set: z.string().min(1),
    name: z.string().min(1),
  })
  .strict()

/** How much of each participant the list answers. */
const listShape = z.object({ shape: z.literal(PAGE_SHAPE, { error: PAGE_SHAPE_REFUSAL }).optional(), cursor: z.string().optional(), limit: z.coerce.number().int().positive().optional() })

const whichParticipant = z
  .object({
    kind: z.enum(PARTICIPANT_KINDS),
    id: z.string().min(1),
  })
  .strict()

/**
 * THE PARTICIPANT A `:kind/:id` PATH NAMES, WITH AN AGENT READ BY ITS REGISTRY ID.
 *
 * The `:id` of an agent is an arriving reference. A client may send the agent's handle or its id:
 * the dsh hooks send the handle (criterion I9), and a new agent's handle is not its id. So the
 * segment goes through the one resolver once, here, and every read and every setter after this gets
 * the registry id the resolver chose. A refusal of the resolver is this door's answer: a string that
 * is one agent's id and another live agent's handle, or, on a write, a retired agent's handle. It is
 * thrown before the door writes anything. Nobody answering is the door's 404.
 *
 * A person is read by the id in the path, as before. Criterion I6: persons are untouched.
 */
function theParticipantThePathNames(who: ParticipantRef, doing: WhatTheCallerIsDoing): ParticipantRef {
  if (who.kind !== 'agent') return who
  const named = theAgentAnArrivingReferenceNames(who.id, doing)
  if (named === null) throw new PanelError(`No ${participantWord(who.kind)} in this installation answers to "${who.id}".`, 404)
  return { kind: 'agent', id: named.agent.id }
}

/**
 * WHAT THE RESTORE READ TAKES APART FROM THE KEY. One option and no more: the working directory a
 * returning session was started in, which `resolveProject` matches against every project's
 * registered repositories and work areas. Nothing else can name a project here — the workspace
 * header is the other way, and both go through the same reading.
 */
const restoreQuery = z.strictObject({
  directory: z
    .string({ error: 'directory is the absolute path this session was started in' })
    .trim()
    .min(1, { error: 'directory must not be empty — leave it out rather than sending spaces' })
    .optional(),
})

// ============================================================================ what an answer holds

/** One participant as a page draws it: what the registry holds, and where to get the picture. */
interface ParticipantOnTheWire {
  kind: string
  id: string
  name: string
  handle: string
  avatarUrl: string
  state: string | null
  stateAt: string | null
  createdAt: string
  /** Which world this one is a citizen of, or null because nothing could identify one. Criterion C1. */
  homeWorld: string | null
  /**
   * HOW THIS ONE WISHES TO BE ADDRESSED, in their own words. A
   * part left out is a part nobody has set; an empty object is somebody who has set none.
   */
  addressAs: AddressAs
  /** Who last set `addressAs`, and when, or null because nobody recorded it. */
  addressAsSetBy: AddressAsSetBy
  runtime?: string | null
  // True on an agent when a listed agent registered earlier bears the same name (problem hqbovBMnTu-z).
  newerOfASharedName?: boolean
  retired?: boolean
  retiredBecause?: string | null
  /**
   * WHEN IT WAS RETIRED AND BY WHOM. Problem zyCcJYCLsAe7.
   *
   * Null on a row that is not retired, and null on one retired before the retire door existed: those
   * were written by the release of a claim, and nobody recorded the moment or the hand.
   */
  retiredAt?: string | null
  retiredBy?: { kind: string; id: string } | null
  /**
   * THE HANDLE ON THE ROW OF THE AGENT THAT RETIRED THIS ONE, for a page to draw. Wave rule 5:
   * `retiredBy` holds a registry id, and a new agent's id is not a name a person knows. Null where a
   * person retired it, where nobody recorded who did, and where no single agent row answers to the
   * stored id; a page then draws `retiredBy.id` as it is stored.
   */
  retiredByHandle?: string | null
  /**
   * Who set this agent's line, or null because nobody recorded it. Never on a person: a person's
   * line is their own and has only one possible setter. Criterion M21.
   */
  stateBy?: { kind: string; id: string } | null
  /**
   * How this person wants the number on the chat circle drawn, or null because they never chose.
   * Never on an agent: nothing draws a circle for one. Criterion M32.
   */
  circleShows?: CircleShows | null
  /**
   * Which picture this person has put on the round chat button, or null because they never chose.
   * Never on an agent: nothing draws a chat button for one. Criterion M38.
   */
  circlePicture?: string | null
  /**
   * Which name a record named in a message is drawn under, or null because they never chose.
   * Never on an agent: nothing draws a messages panel for one. Criterion M47.
   */
  messageLinkLevel?: MessageLinkLevel | null
  /**
   * How that link is laid out in the bubble, or null because they never chose.
   * Never on an agent: nothing draws a messages panel for one. Criterion M48.
   */
  messageLinkLayout?: MessageLinkLayout | null
  messageProjectMark?: MessageProjectMark | null
  messagePictures?: MessagePictureChoice | null
  /**
   * WHETHER MEDIA A RECORD POINTS AT ARE LOADED: `with-page`, `never`, `on-press`, or null because
   * they never chose. Criterion U5. Never on an agent: nothing draws a report for one.
   *
   * IT IS NOT `messagePictures` ABOVE. That one is about a picture inside a chat message.
   */
  mediaLoad?: MediaLoadChoice | null
  /** How big the chat's own text is, or null because they never chose. Criterion M112. */
  chatTextSize?: ChatTextSize | null
  /** When the chat circle shows, or null because they never chose. */
  chatButtonStays?: ChatButtonStays | null
  /** How the chat opens, or null because they never chose. */
  chatOpensAs?: ChatOpensAs | null
  /** The chosen column layout, or null to follow the available width. */
  chatLayout?: ChatLayout | null
  /** Which key sends a message, or null because they never chose. */
  sendKey?: SendKeySetting | null
  /** Which keyboard shortcuts are on, or null because they never chose. */
  shortcuts?: ShortcutSettings | null
  /** The person's own labels for the messages they write, unreadable with the reader's sentences, or null because they never made one. Migration 0341. */
  chatLabels?: TheStoredMessageLabels
  /** The person's own settings for the two shipped flags and 'No mark', or null because they changed none. Migration 0346. */
  shippedFlags?: StoredShippedFlags | null
  /** The person's look and own themes, unreadable with the reader's sentences, or null because they never set one; only on their own row as they read it. Migration 0347. */
  themes?: TheStoredLook
  language?: Language | null
  /**
   * WHERE THIS PERSON STANDS IN THE OFFICE, from the card they hold: their name and the card's own
   * standing line, built once by `theStandingLineFor`. Criterion P45.
   *
   * NULL WHEN NO CARD HERE ANSWERS TO THE WORD ON THEIR ROW, which is a real answer: the word is
   * still published in `role`, and nothing invents a standing for a card this installation does not
   * hold. Never on an agent: an agent's card is in the other list and says nothing about standing.
   */
  standing?: string | null
  /**
   * WHAT THIS PERSON DOES, in their own words, or null because nobody has written one. Criterion
   * P45. It is theirs to write and nothing checks it; it is not the role, which says where they
   * stand. Never on an agent.
   */
  occupation?: string | null
  /**
   * WHICH PORTRAIT IS ON THIS PERSON'S CARD, by the address it is served at, or null because they
   * have not chosen. Criterion P47. Null is not "no picture": the card's own is drawn instead.
   * Never on an agent, whose own choice of portrait is not stored yet.
   */
  portrait?: string | null
  /**
   * THE AGENT RECORD THIS ROW IS JOINED TO IN THE PROJECT THIS REQUEST IS ABOUT, or null.
   *
   * Criterion M36: pressing an agent's picture in a conversation opens its record page, and this is
   * the page. Null means no record in this project answers for it — a registry row can outlive the
   * record that made it, and a reader is told there is nowhere to go rather than sent nowhere.
   *
   * IT IS THE ONE PROJECT-SHAPED FIELD ON AN INSTALLATION-SHAPED REPLY, and that is what it is: the
   * registry row is the installation's and the record is a project's. The project comes from the
   * header on the request, like every other read.
   */
  record?: string | null
  /**
   * WHO STARTED THIS AGENT, or null because nobody recorded one. Never on a person. Criterion P1.
   *
   * Null is not "the person started it". It is what every row registered before 6 September 2026
   * holds, and what an agent a person registered by hand holds. A screen says nobody recorded one.
   */
  startedBy?: { kind: string; id: string } | null
  /**
   * THE ROLE ON THE CARD THIS AGENT HOLDS, or null because nobody set one. Criterion P2.
   *
   * A row with null here is READ AS a worker by the enforcement, and this reply says so in two
   * fields rather than one: `role` is what somebody chose, and `readAs` is what the refusals use.
   * Collapsing them would draw a word nobody chose on a page as though somebody had.
   */
  role?: string | null
  /** What the enforcement reads for this row: the role, or the word a row with none is read as. */
  roleReadAs?: string | null
  /** What a screen says where nobody set a role. Null when one is set, so nothing draws both. */
  roleSays?: string | null
  /**
   * WHO CHOSE THE CARD ON THIS ROW, criterion P75, or null because nobody recorded it.
   *
   * `roleSays` above says whether a word is on the row at all; this says who put it there, and it
   * is stored rather than worked out. Null is every row written before 8 September 2026 and is
   * never read as either answer. Never on a person: a person holds their own card by their own door.
   */
  cardChosenBy?: WhoChoseTheCard | null
  /**
   * THE FOLDERS AND FILES THIS AGENT WAS STARTED TO CHANGE, or null because nobody recorded any.
   *
   * Criterion P43: an agent's working area, its folders and files, is registered when it registers and
   * starts, which makes its changes easy to find. Null and an empty list are different answers, and
   * both are published: null is nobody recorded one, an empty list is somebody saying there is none.
   */
  workArea?: string[] | null
  /**
   * THE RECORD WHOSE END ENDS THIS ROLE, or null because nobody named one. Criterion P15.
   *
   * What ends each role is on its card; for a worker it is the piece of work
   * it was started for, and this names it.
   */
  startedFor?: string | null
  /**
   * THE STARTERS ABOVE THIS AGENT, nearest first, ending at the person where they get there.
   *
   * Criterion P9: *the chain is readable in one request*. It is on the list as well as on one
   * participant, because working it out a rung at a time would cost one request per rung.
   */
  chain?: { kind: string; id: string }[]
  /** True only when a person is at the top of the chain. */
  chainReachesThePerson?: boolean
  /** One sentence about where the chain got to. The same sentence a refusal uses. */
  chainSays?: string
  /**
   * WHICH VISITOR CREDENTIAL THIS AGENT WAS REGISTERED ON, or null because it needed none. P69.
   *
   * Null is the ordinary answer and means this machine: a registration made here needs none, and
   * one made from elsewhere is refused without one. So null says "none was needed", never "nobody
   * looked".
   */
  credential?: string | null
  /**
   * THE SECRETARY'S BROADCAST: the next slot, the last broadcast and whether the unanswered rule has
   * paused it, as plain sentences. Present only on the one-participant
   * reads, where a page draws it; absent on the roster, which draws no state per row and would pay a
   * read per agent for it. Absent on a person.
   */
  broadcast?: BroadcastReading | null
}

/** The shortcuts the registry row holds, read once more by the one strict reading, or null. */
function theShortcutsHeld(held: unknown): ShortcutSettings | null {
  if (held === null || held === undefined) return null
  const read = readShortcutSettings(held)
  return read.ok ? read.settings : null
}

/** The person's own labels the registry row holds, read once more by the one strict reading, or unreadable with the reader's sentences, or null. */
function theLabelsHeld(held: unknown): TheStoredMessageLabels {
  if (held === null || held === undefined) return null
  if (isAnUnreadableMessageLabels(held)) return held
  const read = readMessageLabels(held)
  return read.ok ? read.labels : { unreadable: [read.why] }
}

/** The person's own shipped-flag settings the registry row holds, read once more by the one strict reading, or null. */
function theShippedFlagsHeld(held: unknown): StoredShippedFlags | null {
  if (held === null || held === undefined) return null
  const read = readShippedFlags(held)
  return read.ok ? read.flags : null
}


/** Construct only fields the page cache consumes, without reading a participant's chain. */
function pageParticipant(kind: 'person' | 'agent', held: Record<string, unknown>, avatars: readonly AvatarOnOffer[], records: ReadonlyMap<string, string>, newer: ReadonlySet<string>, officeTest: (who: ParticipantRef) => boolean) {
  const id = String(held['id'])
  const role = held['role'] === null || held['role'] === undefined ? null : String(held['role'])
  const base = {
    kind, id, name: String(held['name']), handle: String(held['handle']),
    avatarUrl: pictureShownFor({ kind, id }, String(held['avatarAssetId']), avatars, kind === 'agent' ? role : null, officeTest),
    state: held['state'] === null ? null : String(held['state']),
    addressAs: held['addressAs'] as AddressAs,
  }
  if (kind === 'person') return {
    ...base,
    circleShows: isCircleShows(held['circleShows']) ? held['circleShows'] : null,
    circlePicture: circlePicture(held['circlePicture'])?.name ?? null,
    messageLinkLevel: isMessageLinkLevel(held['messageLinkLevel']) ? held['messageLinkLevel'] : null,
    messageLinkLayout: isMessageLinkLayout(held['messageLinkLayout']) ? held['messageLinkLayout'] : null,
    messageProjectMark: isMessageProjectMark(held['messageProjectMark']) ? held['messageProjectMark'] : null,
    messagePictures: isMessagePictureChoice(held['messagePictures']) ? held['messagePictures'] : null,
    mediaLoad: isMediaLoadChoice(held['mediaLoad']) ? held['mediaLoad'] : null,
    chatTextSize: isChatTextSize(held['chatTextSize']) ? held['chatTextSize'] : null,
    chatButtonStays: isChatButtonStays(held['chatButtonStays']) ? held['chatButtonStays'] : null,
    chatOpensAs: isChatOpensAs(held['chatOpensAs']) ? held['chatOpensAs'] : null,
    chatLayout: isChatLayout(held['chatLayout']) ? held['chatLayout'] : null,
    sendKey: isSendKeySetting(held['sendKey']) ? held['sendKey'] : null,
    shortcuts: theShortcutsHeld(held['shortcuts']), chatLabels: theLabelsHeld(held['chatLabels']),
    shippedFlags: theShippedFlagsHeld(held['shippedFlags']),
    language: isLanguage(held['language']) ? held['language'] : null, role,
  }
  const setter = held['stateBy']
  return {
    ...base, newerOfASharedName: newer.has(id), retired: held['retired'] === true,
    retiredAt: held['retiredAt'] === null || held['retiredAt'] === undefined ? null : String(held['retiredAt']),
    stateBy: setter === null || setter === undefined ? null : { kind: String((setter as { kind: unknown }).kind), id: String((setter as { id: unknown }).id) },
    record: records.get(id) ?? null, role,
  }
}

const PARTICIPANT_REPLY_BYTES = 512_000
const participantCursor = z.object({ kind: z.enum(['person', 'agent']), handle: z.string(), rowid: z.number().int().positive(), id: z.string() }).strict()

function onTheWire(
  kind: 'person' | 'agent',
  held: Record<string, unknown>,
  workspaceId: string,
  // THE STORED READER the chain and the retiring agent's handle are read with. The roster makes it from the list it
  // already read (`theAgentAStoredReferenceNamesIn`), so a list of forty agents is still one query; a door about one
  // participant makes it from the rows each string names (`theStarterEachStringNames`), so it reads only the agents on
  // the chain. A person's row reads neither, and is given a reader that names nobody.
  theAgentThisNames: (id: string) => AStarter | null,
  // THE PICTURES ON OFFER, READ ONCE BY A CALLER LISTING SEVERAL PARTICIPANTS. Measured 11
  // September 2026 (problem 9UeL9VeVPn33): `avatarsOnOffer` runs `existsSync` and `readdirSync` over
  // both avatar directories, and this called it once per participant — 154 filesystem calls on a
  // roster of 77. The picture sets do not change between one participant and the next inside the
  // same reply, so `GET /api/participants` reads them once and hands the same list to every row; a
  // caller asking about one participant still reads here. Measured by hand on problem 9UeL9VeVPn33;
  // no test counts the filesystem reads yet.
  avatars: readonly AvatarOnOffer[] = avatarsOnOffer(),
  // EVERY AGENT'S OWN RECORD IN THIS PROJECT, READ ONCE BY A CALLER LISTING SEVERAL (acceptance
  // finding 26, 22 September 2026). `recordForAgentIn` is one query, and this builder called it once
  // per row: on the live office that is 388 queries and 2.46 s for the one request, and a CPU
  // profile of the office under ten working agents put 54% of its whole time inside that walk. The
  // roster now reads them all in one query and hands the same map to every row; a caller asking
  // about one participant passes none and reads its own. Same shape as `avatars` above, and for the
  // same reason.
  records: ReadonlyMap<string, string> | null = null,
  // THE AGENTS THAT SHARE THEIR NAME WITH AN OLDER ONE, READ ONCE BY A CALLER LISTING SEVERAL, for the
  // reason `records` above is. A caller asking about one participant passes none and reads its own.
  newerOfASharedName: ReadonlySet<string> | null = null,
  officeTest: (who: ParticipantRef) => boolean = isMoleOffice,
): ParticipantOnTheWire {
  const id = String(held['id'])
  const base: ParticipantOnTheWire = {
    kind,
    id,
    name: String(held['name']),
    handle: String(held['handle']),
    // WHERE THE PICTURE IS, WHICH IS NOT ALWAYS THE ROW'S OWN ASSET. Nobody has chosen a picture
    // for this one while the row still points at the drawing, and then the address is the picture
    // they are offered — chill-bee, criterion M53. `pictureShownFor` is the one place that decides.
    // AN AGENT THAT CHOSE NO PICTURE WEARS ITS CARD'S FIRST PORTRAIT, criterion M75. The role is
    // read off the row here rather than inside `pictureShownFor`, because this builder already has
    // it and a second read of the same row would be the same fact fetched twice.
    avatarUrl: pictureShownFor(
      { kind, id },
      String(held['avatarAssetId']),
      avatars,
      kind === 'agent' && held['role'] !== null && held['role'] !== undefined ? String(held['role']) : null,
      officeTest,
    ),
    state: held['state'] === null ? null : String(held['state']),
    stateAt: held['stateAt'] === null ? null : String(held['stateAt']),
    createdAt: String(held['createdAt']),
    /**
     * WHICH WORLD THIS ONE IS A CITIZEN OF, criterion C1, and the reply used to leave it out.
     *
     * The column has been on both registries since migration 0122 and the library has carried it
     * since, but this reply was built from eleven named fields and this was not one of them. The
     * cost was C6: `theVisitThisRunNeeds` in src/worker/index.ts reads an agent's home world off
     * this reply to decide whether the run it is about to start is away from home, so it read null
     * every time, answered "at home" for every run, and the `POST /api/office/visits` beneath it
     * was unreachable code. Problem `FEsoy7vrGMWV`, measured end to end by the citizens verifier.
     *
     * NULL IS A REAL ANSWER: a row written before 0122 that the migration could not identify a world
     * for was left with none rather than given an invented one.
     */
    homeWorld: held['homeWorld'] === null || held['homeWorld'] === undefined ? null : String(held['homeWorld']),
    // HOW THEY WISH TO BE ADDRESSED, as `addressAsOf` in lib/participants.ts read it off the row: only
    // the parts somebody set, each as written.
    addressAs: held['addressAs'] as AddressAs,
    // WHO LAST SET IT, AND WHEN, or null because nobody recorded it. The change is migration 0182.
    addressAsSetBy: (held['addressAsSetBy'] as AddressAsSetBy | undefined) ?? null,
  }
  if (kind === 'person') {
    // HOW THIS PERSON WANTS THE CHAT CIRCLE DRAWN, criterion M32, or null because they never chose.
    // It is on the person and not on the base, because only a person has a circle.
    //
    // AND WHICH CARD THEY HOLD, criterion P45. Three fields for the same reason an agent's role is
    // three: `role` is the word somebody wrote, `roleReadAs` is the word anything reading the card
    // uses, and `roleSays` is what a screen prints where nobody wrote one — so a page never draws a
    // word nobody chose as though somebody had. `standing` is the line the card gives them, built in
    // one place from their name and their card; null when no card here answers to the word on the
    // row, which is a real answer and not a default.
    const theirRole = held['role'] === null || held['role'] === undefined ? null : String(held['role'])
    const card = personCardFor(theRoleCards(), theirRole)
    return {
      ...base,
      circleShows: isCircleShows(held['circleShows']) ? held['circleShows'] : null,
      circlePicture: circlePicture(held['circlePicture'])?.name ?? null,
      messageLinkLevel: isMessageLinkLevel(held['messageLinkLevel']) ? held['messageLinkLevel'] : null,
      messageLinkLayout: isMessageLinkLayout(held['messageLinkLayout']) ? held['messageLinkLayout'] : null,
      messageProjectMark: isMessageProjectMark(held['messageProjectMark']) ? held['messageProjectMark'] : null,
      messagePictures: isMessagePictureChoice(held['messagePictures']) ? held['messagePictures'] : null,
      // AND WHETHER MEDIA A RECORD POINTS AT ARE LOADED. Criterion U5, and a different setting from
      // the one above it: null is nobody having chosen and is not a word this reader invents.
      mediaLoad: isMediaLoadChoice(held['mediaLoad']) ? held['mediaLoad'] : null,
      chatTextSize: isChatTextSize(held['chatTextSize']) ? held['chatTextSize'] : null,
      chatButtonStays: isChatButtonStays(held['chatButtonStays']) ? held['chatButtonStays'] : null,
      chatOpensAs: isChatOpensAs(held['chatOpensAs']) ? held['chatOpensAs'] : null,
      chatLayout: isChatLayout(held['chatLayout']) ? held['chatLayout'] : null,
      sendKey: isSendKeySetting(held['sendKey']) ? held['sendKey'] : null,
      shortcuts: theShortcutsHeld(held['shortcuts']),
      chatLabels: theLabelsHeld(held['chatLabels']),
      shippedFlags: theShippedFlagsHeld(held['shippedFlags']),
      language: isLanguage(held['language']) ? held['language'] : null,
      role: theirRole,
      roleReadAs: theirRole ?? A_PERSON_WITH_NO_ROLE_READS_AS,
      roleSays: theirRole === null ? NO_ROLE_SET : null,
      standing: card === null ? null : theStandingLineFor(String(held['name']), card),
      // WHAT THEY DO, in their own words, or null because nobody has written one. Never guessed.
      occupation:
        held['occupation'] === null || held['occupation'] === undefined ? null : String(held['occupation']),
      // AND WHICH PORTRAIT IS ON THEIR CARD, criterion P47, or null because they have not chosen —
      // in which case the card's own picture is what a screen draws.
      portrait: held['portrait'] === null || held['portrait'] === undefined ? null : String(held['portrait']),
    }
  }
  const setter = held['stateBy']
  const starter = held['startedBy']
  const role = held['role'] === null || held['role'] === undefined ? null : String(held['role'])
  return {
    ...base,
    runtime: held['runtime'] === null ? null : String(held['runtime']),
    // WHETHER A LISTED AGENT REGISTERED EARLIER BEARS THE SAME NAME, so the chat marks this one as the
    // newer of the two (problem hqbovBMnTu-z). `theAgentsNewerThanASameNamedOne` says what newer is.
    newerOfASharedName: (newerOfASharedName ?? theAgentsNewerThanASameNamedOne()).has(id),
    retired: held['retired'] === true,
    retiredBecause: held['retiredBecause'] === null ? null : String(held['retiredBecause']),
    // AND WHEN AND BY WHOM, problem zyCcJYCLsAe7. A page saying an agent was retired and not by whom
    // leaves the reader asking the one question the row now holds an answer to.
    retiredAt: held['retiredAt'] === null || held['retiredAt'] === undefined ? null : String(held['retiredAt']),
    retiredBy: (held['retiredBy'] as { kind: string; id: string } | null | undefined) ?? null,
    retiredByHandle: theHandleAStoredReferenceNames(
      (held['retiredBy'] as { kind: string; id: string } | null | undefined) ?? null,
      theAgentThisNames,
    ),
    stateBy:
      setter === null || setter === undefined
        ? null
        : { kind: String((setter as { kind: unknown }).kind), id: String((setter as { id: unknown }).id) },
    // AND WHERE TO READ THE REST OF IT, criterion M36. Null when no record in this project answers.
    record: records === null ? recordForAgentIn(String(held['id']), workspaceId) : (records.get(String(held['id'])) ?? null),
    // WHO STARTED IT, WHAT IT MAY DO AND WHERE IT WORKS. Criteria P1, P2 and P43. The chain a reader
    // follows is built from `startedBy` on each row, so it is published on the list as well as on
    // one participant: working it out would otherwise cost one request per rung.
    startedBy:
      starter === null || starter === undefined
        ? null
        : { kind: String((starter as { kind: unknown }).kind), id: String((starter as { id: unknown }).id) },
    role: role,
    // TWO FIELDS AND NOT ONE. `role` is the word somebody chose and `roleReadAs` is the word the
    // refusals use, which for a row with no role is `worker`. One field would draw a word nobody
    // chose on a page as though somebody had chosen it, which is the thing criterion P2 forbids.
    roleReadAs: role ?? A_ROW_WITH_NO_ROLE_READS_AS,
    roleSays: whatAnAgentsAnswerSaysOfItsCard(id, role, officeTest),
    // AND WHO CHOSE THAT CARD, criterion P75. Read off the row and never derived: `roleSays` above
    // says whether a word is there at all, and this says who put it there. Null is nobody having
    // recorded it, which is every row written before 8 September 2026.
    cardChosenBy: theMarkSaying(held['cardChosenBy']),
    workArea: Array.isArray(held['workArea']) ? (held['workArea'] as string[]) : null,
    startedFor: held['startedFor'] === null || held['startedFor'] === undefined ? null : String(held['startedFor']),
    // WHICH CREDENTIAL THE OFFICE LET THIS AGENT IN ON, criterion P69, or null because it needed
    // none. Published on the list as well as on one participant, because the Embassy draws a row
    // per participant and working it out would otherwise cost one request per row.
    credential: held['credential'] === null || held['credential'] === undefined ? null : String(held['credential']),
    // AND THE WHOLE CHAIN ABOVE IT, criterion P9. Worked out with the reader the caller made, so a list
    // of forty agents is still one query, and one participant reads only the agents on its chain.
    ...chainOnTheWire(starter === null || starter === undefined ? null : (starter as ParticipantRef), theAgentThisNames),
  }
}

/**
 * THE HANDLE OF A STORED AGENT REFERENCE, READ WITH THE STORED READER THE CALLER MADE.
 *
 * The stored reader: the agent whose id this exactly is, then the one agent bearing the string as a
 * handle, and nobody where more than one bears it. `theChainUpWith` reads a `startedBy` with the same
 * reader. The roster makes it from one list, so this costs no query per row. Null for a person, for no
 * reference, and where no single agent answers.
 */
function theHandleAStoredReferenceNames(
  ref: { kind: string; id: string } | null,
  theAgentThisNames: (id: string) => AStarter | null,
): string | null {
  if (ref === null || ref.kind !== 'agent') return null
  return theAgentThisNames(ref.id)?.handle ?? null
}

/**
 * WHAT AN AGENT'S ANSWER SAYS OF ITS CARD for a screen, beside `roleReadAs`: nothing where somebody chose a card, and
 * "no role set" where nobody has yet. MOLE OFFICE'S OWN ROW IS NEITHER. It is the office itself and holds no card, so
 * its answer says that. `roleReadAs` still says the worker card for it, because the rules read the row at that card.
 * The participant read, the roster and the restore read all say it from here.
 */
function whatAnAgentsAnswerSaysOfItsCard(
  id: string,
  role: string | null,
  officeTest: (who: ParticipantRef) => boolean = isMoleOffice,
): string | null {
  if (officeTest({ kind: 'agent', id })) return MOLE_OFFICES_OWN_ROW_SAYS_OF_ITS_CARD
  return role === null ? NO_ROLE_SET : null
}

/**
 * THE ONE-PARTICIPANT WIRE, WITH THE BROADCAST READING A PAGE DRAWS.
 *
 * It is on the two reads about one participant and never on the roster: a list draws no broadcast,
 * and working one out per row would pay a message query for every agent on the page. IT IS LEFT OFF
 * AN AGENT THAT HAS NEVER HELD THE SECRETARY CARD, which is what B8 asks: nothing changes for an
 * agent that is not a secretary. A retired secretary keeps its ended schedule, so the field is
 * still there and says when broadcasts ended.
 */
function onTheWireWithTheBroadcast(
  kind: 'person' | 'agent',
  held: Record<string, unknown>,
  workspaceId: string,
  theAgentThisNames: (id: string) => AStarter | null,
  now: Date,
): ParticipantOnTheWire {
  const wire = onTheWire(kind, held, workspaceId, theAgentThisNames)
  if (kind !== 'agent') return wire
  const who = String(held['id'])
  if (!theBroadcastScheduleIsHeldFor(who)) return wire
  return { ...wire, broadcast: theBroadcastReadingFor(who, now) }
}

/** The chain, as three fields, from the one reading both the reply and the refusal use. */
function chainOnTheWire(
  from: ParticipantRef | null,
  theAgentThisNames: (id: string) => AStarter | null,
): { chain: { kind: string; id: string }[]; chainReachesThePerson: boolean; chainSays: string } {
  const read = theChainUpWith(from, theAgentThisNames)
  return { chain: read.chain, chainReachesThePerson: read.reachesThePerson, chainSays: read.says }
}

/**
 * How many times the picture limit a request body may be before this route stops reading at all.
 *
 * FOUR, SO THAT AN OVERSIZE PICTURE IS REFUSED IN THIS PRODUCT'S WORDS AND NOT IN FASTIFY'S. The
 * ordinary way to meet the limit is to send a photograph, which is not a few kilobytes over it but
 * several times it. Four times the limit covers that and is still small enough to hold in memory on
 * a loopback connection: with the built-in limit of 2 MB it is a body of about 11 MB.
 *
 * IT IS NOT A SECOND LIMIT ON A PICTURE. The only limit on a picture is
 * `MOLE_OFFICE_AVATAR_MAX_BYTES`, checked in `storeUploadedAvatar`. This number decides which
 * refusal an enormous body gets, and both refusals name that setting.
 */
const BODIES_THIS_ROUTE_WILL_READ = 4

/** The JSON around a picture: `{"bytes":"…"}`, and nothing else this route accepts. */
const JSON_AROUND_A_PICTURE = 4096

/**
 * The largest JSON body this route accepts, from the setting the size check reads.
 *
 * Base64 is four bytes on the wire for every three of picture, and a JSON object holds a little more
 * again — so the limit here is four times the setting, plus a third, plus a small allowance for the
 * rest of the body. A picture up to four times the limit therefore meets `storeUploadedAvatar`,
 * which refuses it with both numbers.
 */
function bodyLimitForAPicture(limit: number): number {
  return Math.ceil((limit * BODIES_THIS_ROUTE_WILL_READ * 4) / 3) + JSON_AROUND_A_PICTURE
}

/**
 * What a caller reads when the body is past even that, in place of *Request body is too large*.
 *
 * IT NAMES THE SAME TWO THINGS THE SIZE REFUSAL NAMES: how big a picture may be, and which setting
 * holds the number. It cannot say how big the picture was, because nothing read it — saying a size
 * here would be inventing one.
 */
function pastEvenTheBodyLimit(limit: number, bodyLimit: number): string {
  return (
    `Nothing was read, because that request is bigger than this route reads at all. An avatar is at most ` +
    `${String(limit)} bytes. This route stops reading at ${String(bodyLimit)} bytes of request, which is about ` +
    `${String(limit * BODIES_THIS_ROUTE_WILL_READ)} bytes of picture. How big this one is was never measured, so ` +
    'nothing here says. Nothing was written. The limit is MOLE_OFFICE_AVATAR_MAX_BYTES.'
  )
}

/** Fastify's own code for a body past the route's limit, which is the one refusal this route rewrites. */
const BODY_TOO_LARGE = 'FST_ERR_CTP_BODY_TOO_LARGE'

// ============================================================================ one profile

/**
 * EVERYTHING ONE PARTICIPANT'S PAGE DRAWS EXCEPT THE REGISTRY ROW AND THE PRESENCE READING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ONE READ AND NOT EIGHT
 * ---------------------------------------------------------------------------------------
 *
 * The page needs the registry row, whether they can be reached, the contact group the reader put
 * them in, the world they are a citizen of, the trips they have made, the machines they were seen
 * from, whether a session is answering as them, what they filed lately and the short name proposed
 * for them. Eight routes already answer parts of that, and a page calling all of them would read
 * eight clocks and could draw two halves of itself from moments seconds apart. `GET /api/working`
 * is one request for the same reason and says so.
 *
 * NOTHING HERE COMPUTES A FACT A SECOND TIME. Every line below calls the reader the matching route
 * calls, so this composes and never re-derives — a change to any of those rules reaches this page
 * without anybody editing it.
 */
function theProfile(
  who: ParticipantRef,
  held: Record<string, unknown>,
  workspaceId: string,
  reader: ParticipantRef | null,
  actor: Actor,
  whatTheRoutesSay: WhatTheRoutesSay,
): ProfileFacts {
  const isAgent = who.kind === 'agent'
  const handle = String(held['handle'])
  const homeWorld = held['homeWorld'] === null || held['homeWorld'] === undefined ? null : String(held['homeWorld'])
  // THE THREE FACTS THE P88 SENTENCE READS, taken off the row once. Criterion P88.
  const heldRuntime = held['runtime'] === null || held['runtime'] === undefined ? null : String(held['runtime'])
  const heldCredential = held['credential'] === null || held['credential'] === undefined ? null : String(held['credential'])
  const heldCreatedAt = held['createdAt'] === undefined ? '' : String(held['createdAt'])
  const aliases = theFiledAliasesReadOnce(sqlite)
  return {
    workspaceId,
    group: theGroupTheyAreIn(who, workspaceId, reader, aliases),
    ...theCitizenship(homeWorld),
    ...theTrips(who),
    seenFrom: machinesSeenFrom(who),
    seenFromSays: isAgent ? SEEN_FROM_SAYS.agent : SEEN_FROM_SAYS.person,
    // AN AGENT'S HANDLE AND NOT ITS REGISTRY ID, because that is what a hold is taken on. A person
    // holds no handle, so there is nothing to answer rather than nobody answering.
    answering: isAgent ? whoIsAnsweringAs(String(held['id']), workspaceId) : null,
    // NO MESSAGE THE CALLER MAY NOT READ is among them.
    filedLately: isAgent
      ? recentlyWritten(String(held['id']), handle, workspaceId, everyMessageHiddenFrom(theMessageReader(actor), workspaceId), aliases)
      : null,
    filedLatelySays: isAgent ? FILED_LATELY_SAYS : null,
    // THE SAME RULE THE PANEL USES: a proposal is live only while the name is still not the one
    // proposed. `namesStillToChange` in the browser reads this list the same way, from the same
    // declaration, so the two cannot disagree about which rows are left.
    proposedName:
      PROPOSED_NAMES.find((one) => one.id === who.id && one.name !== String(held['name'])) ?? null,
    // WHICH CARD IT HOLDS, AND WHETHER IT IS ACTING FOR THE PERSON. Criterion P64. The office's own sender
    // row holds none: it is the office itself, so its page draws no card and no press to give one.
    theCardTheyHold: isAgent && !isMoleOffice(who) ? theCardTheyHold(handle, held['role'], held['cardChosenBy'], workspaceId, whatTheRoutesSay) : null,
    /**
     * WHO REGISTERED THIS AGENT'S WORK AREA AND WHEN, criterion P85, or null because nobody
     * recorded it. It is read from the agent record's `extra.workAreaChange`, which the work area
     * door writes, and so do the two doors where a start is asked, which set a declared area, and
     * Mole Office when it empties an area at a seal, a failed start or a crashed run. It is read on
     * this one-participant reply and not on the roster: the mark belongs to one record, and a list
     * that fetched every record to draw it would read the whole corpus to draw a sentence about one
     * row.
     */
    workAreaChange: isAgent ? theWorkAreaChangeOf(held, workspaceId) : null,
    // AND THE SENTENCE THAT SAYS THIS AREA PREDATES THE RULE, criterion P92 and the ruling that
    // narrows it. Null on a person, on an agent with no area, and on every area the new door wrote.
    workAreaBeforeTheRule: isAgent ? theWorkAreaPredatesTheRule(held, workspaceId) : null,
    // AND THE SENTENCE SAYING AN AREA OVERLAPS ANOTHER'S, criterion P95, or null. Read from the
    // record's own mark, which the overlap writer set on both agents' records.
    workAreaOverlap: isAgent ? theWorkAreaOverlapOf(held, workspaceId) : null,
    /**
     * WHETHER AGENTS MAY INJECT, and where that is set. Criteria M84 and M91.
     *
     * It is one switch for every agent, on the Settings page, so every agent's page carries the same
     * reading and none carries a press. The reading comes from the reader the message door asks, so
     * a profile can never say yes while the door refuses.
     */
    mayInject: isAgent ? whetherAgentsMayInject() : null,
    // AND WHO HAS INJECTED TO THIS PERSON, per sender. Criterion M84. A person may inject without
    // limit, so a person's page carries the count and an agent's page carries the right.
    injectedToThem: isAgent ? null : whoHasInjectedTo(who),
    /**
     * WHETHER WHOEVER IS ASKING MAY RETIRE THIS ROW, AND WHY NOT. Criterion P82.
     *
     * The same function the retire door asks, so a page can never offer a press the door would
     * refuse, and a reader who may not is told who may. Null on a person: nobody retires a person.
     *
     * IT IS THE ACTOR AND NOT THE READER. `reader` above is the participant this office can name for
     * the caller, and it is null for a caller no registry holds; whether this act is allowed is
     * decided from the actor headers, which is what the door itself reads.
     */
    mayRetire: isAgent ? whoMayRetire(held as unknown as RegisteredAgent, actor) : null,
    // AND THE SENTENCE THAT SAYS THIS ROW WAS ADMITTED BEFORE P88. Criterion P88. Null on a person
    // and on every agent the gate does not govern — one with a credential, one whose runtime is this
    // machine's own Claude Code, and one written after the gate existed.
    admittedBeforeP88:
      isAgent && admittedBeforeP88(heldRuntime, heldCreatedAt, heldCredential)
        ? admittedBeforeP88Says(heldRuntime, heldCreatedAt)
        : null,
    // AND THE RUNS THIS AGENT WORKED AS, with the model, the effort, the tokens and the compactions
    // each one declared. Criterion P91. Null on a person, who starts no runs. The agent RECORD this
    // project holds is what `ranAs` names, so `recordForAgentIn` is asked first and null there is a
    // real answer the page draws rather than an empty list.
    agentRuns: isAgent ? theAgentsRuns(recordForAgentIn(String(held['id']), workspaceId), workspaceId) : null,
    // AND ITS CURRENT HANDOVER IN THIS PROJECT, read by the handover door's own rule (wave 13k round 46). Null on a
    // person, who writes none.
    handover: isAgent ? theHandoverPartFor(actor, held as unknown as RegisteredAgent, workspaceId) : null,
    // AND THE CARD ASK WAITING FOR THE PERSON, or null. F15 point 2: the ask the role door used to
    // refuse with a 409 waits here, and the press on this page answers it.
    cardAsk: isAgent ? theCardAskWaitingOnThePerson(String(held['id']), handle, workspaceId) : null,
    // AND EACH MODEL LOGIN'S WEEK, on a secretary's page only (lib/logins-week.ts). The page draws it in Developer mode.
    ...theWeekOnTheProfile(isAgent, handle),
  }
}

/** The week reading for a secretary's page, as a part to spread, so every other page's reply is unchanged. */
function theWeekOnTheProfile(isAgent: boolean, handle: string): { loginsWeek?: LoginsWeek } {
  const loginsWeek = isAgent ? theLoginsWeekForASecretary(handle) : null
  return loginsWeek === null ? {} : { loginsWeek }
}

/**
 * THE CARD THIS AGENT ASKED THE PERSON FOR AND THEY HAVE NOT ANSWERED, or null. F15 point 2.
 *
 * A `role_request` answered by the person, unanswered, whose asker is this agent. The same reading
 * `GET /api/needs-you` makes, so the two surfaces cannot disagree about whether a card waits.
 */
function theCardAskWaitingOnThePerson(agentId: string, handle: string, workspaceId: string): WaitingCardAsk | null {
  const record = listRecords({ workspaceId, kind: 'role_request' }).find((one) => {
    const answersTo = one.data['answersTo'] as { kind?: unknown } | undefined
    if (answersTo?.kind !== 'person') return false
    const answered = one.data['answer']
    if (typeof answered === 'string' && answered !== '') return false
    // THE ASKER IS A STORED REFERENCE: a registry id since the role request door and the
    // self-registration store one, a handle on an older ask. It is read with the stored reader and
    // compared with this agent's registry id, so both kinds of ask are found.
    const asker = one.data['asker'] as { kind?: unknown; id?: unknown } | undefined
    if (asker?.kind !== 'agent' || typeof asker.id !== 'string') return false
    const named = theAgentAStoredIdNames(asker.id) ?? theOneAgentAStringNames(sqlite, asker.id)
    return named !== null && named.id === agentId
  })
  if (record === undefined) return null
  const asking = typeof record.data['asking'] === 'string' ? record.data['asking'] : ''
  const waiting = aWaitingSelfRegistration(record)
  // WHAT THE PRESS DOES, from the one reading every surface asks. A card ask keeps its own words here.
  const press = whatAPressOnThisAskDoes(record)
  // THE ASKER'S OFFICE NAME, found from the stored reference as every other person-facing sentence
  // finds it: the stored-reference reader first, then the one agent an older ask's handle names.
  // Where neither answers, or the row's office name is blank, the stored handle is what a reader sees.
  // The stored reference and the `handle` field below are not changed by this.
  const asker = record.data['asker'] as { kind?: unknown; id?: unknown } | undefined
  const named =
    asker?.kind === 'agent' && typeof asker.id === 'string'
      ? (theAgentAStoredIdNames(asker.id) ?? theOneAgentAStringNames(sqlite, asker.id))
      : null
  const name =
    waiting !== null
      ? theNameASelfRegistrationIsReadBy(waiting)
      : named === null
        ? handle
        : theNameASelfRegistrationIsReadBy(named)
  return {
    requestId: record.id,
    handle,
    name,
    asking,
    admitsAnAgent: waiting !== null,
    press: press?.press ?? 'card',
    says:
      press === null || press.press === 'card'
        ? `"${name}" asks you for the ${asking} card. An agent cannot give itself a card, so only your press can.`
        : press.says,
  }
}

/**
 * THE LAST WORK-AREA CHANGE ON THIS AGENT'S RECORD, criterion P85, or null.
 *
 * NOTHING HERE INVENTS A MARK. The record in this project is the only place the door writes it; an
 * agent with no record here, or a record nobody has changed since it registered, has none, and the
 * page says nobody recorded it. `theWorkAreaMarkSaying` reads whatever is stored strictly, so a
 * value this build cannot make sense of is nobody having recorded rather than a guessed sentence.
 */
function theWorkAreaChangeOf(
  held: Record<string, unknown>,
  workspaceId: string,
): WhoRegisteredTheWorkArea | null {
  const recordId = recordForAgentIn(String(held['id']), workspaceId)
  if (recordId === null) return null
  const record = getRecord(recordId)
  if (record === null) return null
  const extra = record.data['extra'] as Record<string, unknown> | undefined
  return theWorkAreaMarkSaying(extra?.['workAreaChange'])
}

/**
 * WHETHER THIS AGENT'S STORED AREA PREDATES THE WORK-AREA RULE, and the sentence saying so. P92.
 *
 * THE LAST WRITE DECIDES, and the record's own change mark names it where there is one. A widening
 * after the rule re-validates the whole area and moves it out of the old grain, so an area whose
 * last mark is after the rule is not old even when the agent was registered long before it. Where
 * there is no mark the registration moment decides, which is what every never-touched area has.
 * An agent with no area, or an empty one, has nothing to say here.
 */
function theWorkAreaPredatesTheRule(held: Record<string, unknown>, workspaceId: string): string | null {
  const area = held['workArea']
  if (!Array.isArray(area) || area.length === 0) return null
  const registeredAt = held['createdAt'] === undefined ? '' : String(held['createdAt'])
  let changedAt: string | null = null
  const recordId = recordForAgentIn(String(held['id']), workspaceId)
  if (recordId !== null) {
    const record = getRecord(recordId)
    const extra = record?.data['extra'] as Record<string, unknown> | undefined
    changedAt = theWorkAreaMarkSaying(extra?.['workAreaChange'])?.at ?? null
  }
  if (!aWorkAreaBeforeTheRule(registeredAt, changedAt)) return null
  return aWorkAreaBeforeTheRuleSays(changedAt ?? registeredAt)
}

/** The sentence saying this agent's area overlaps another's, or null because nobody recorded one. */
function theWorkAreaOverlapOf(held: Record<string, unknown>, workspaceId: string): string | null {
  const recordId = recordForAgentIn(String(held['id']), workspaceId)
  if (recordId === null) return null
  const record = getRecord(recordId)
  if (record === null) return null
  const extra = record.data['extra'] as Record<string, unknown> | undefined
  return theWorkAreaOverlapSays(theWorkAreaOverlapSaying(extra?.['workAreaOverlap']))
}

/**
 * THE CARD ONE AGENT HOLDS, WHAT ELSE IT COULD BE GIVEN, AND WHETHER IT IS ACTING FOR THE PERSON. P64.
 *
 * NOTHING HERE DECIDES WHICH CARD MAY ACT FOR THE PERSON. `mayBeElevated` is the declaration's own
 * reading, the same one the press and every refusal ask, so a profile cannot come to offer that press
 * on a card the route would refuse it on.
 *
 * `cardsOnOffer` IS THE AGENT LIST AND NEVER THE PERSON LIST. They are two lists in one declaration
 * and nothing reads across them, so a chooser built from both would offer a word no registration
 * could ever use.
 *
 * THE CARD ITSELF IS READ BY THE WORD THE ROW IS READ AS, not by the word written on it. Criterion
 * P71: an agent nobody gave a card to is read as the worker card everywhere in this product, so the
 * card drawn on its page is the worker card, and the line beside it says the word was nobody's
 * choice. Drawing no card there would leave the one row that most needs the explanation with none.
 */
/**
 * The name to say for whoever chose a card, or null. See `chosenByHandle`. An agent is said by the handle on its row;
 * a person by the name on theirs, because the mark stores an id and an id is not a name a person knows (wave 13q
 * round 19 found the agent page printing the person's stored id).
 */
function theHandleOfTheChooser(mark: ReturnType<typeof theMarkSaying>): string | null {
  if (mark === null || mark.who === null) return null
  if (mark.who.kind === 'person') {
    const person = readParticipant({ kind: 'person', id: mark.who.id })
    return person === null || person.name.trim() === '' ? null : person.name
  }
  if (mark.who.kind !== 'agent') return null
  const row = theAgentAStoredIdNames(mark.who.id) ?? theOneAgentAStringNames(sqlite, mark.who.id)
  return row === null ? null : row.handle
}

/** What `POST /api/agents/started` answers about a row it joined. See `whatAJoinedRowHolds`. */
interface WhatAJoinedRowHolds {
  /** The starter the row holds, as the stored reader reads it, or null because nobody recorded one. */
  startedBy: ParticipantRef | null
  startedBySays: string
  /** The run the row records as the one that started it, or null because it records none. */
  startedByRun: string | null
  startedByRunSays: string
  /** The card word the row is read as, for the chapters line. */
  cardReadAs: string
  card: { role: string | null; chosenBy: WhoChoseTheCard | null; says: string }
}

/**
 * WHO STARTED A JOINED ROW AND WHICH CARD IT HOLDS, read from the row. Keys wave, round 6.
 *
 * A registration under a live agent's handle from a second project joins that agent's row, and
 * `keepTheAgentRegistryInStep` writes nothing on the row then: its starter, its card and the mark
 * saying who chose the card stay as they were. So the reply names what the row holds, and says that
 * this registration did not change it.
 *
 * THE STARTER IS A STORED REFERENCE, read with the stored readers: by exact id, then the one agent
 * bearing that string as a handle. Where no one agent answers, the stored value is shown as it is
 * stored and the sentence says that no one agent answers it. A person starter is shown as stored.
 */
function whatAJoinedRowHolds(row: RegisteredAgent, roleSent: string | undefined): WhatAJoinedRowHolds {
  const notChanged = `"${row.handle}" was already a live agent, so this registration did not change`
  const stored = row.startedBy
  let startedBy: ParticipantRef | null = stored
  let whoStarted: string
  if (stored === null) {
    whoStarted = 'Its row records no starter.'
  } else if (stored.kind === 'person') {
    whoStarted = `Its row names the person "${stored.id}" as its starter.`
  } else {
    const named = theAgentAStoredIdNames(stored.id) ?? theOneAgentAStringNames(sqlite, stored.id)
    if (named === null) {
      whoStarted = `Its row holds "${stored.id}" as its starter, and no one agent here answers to that.`
    } else {
      startedBy = { kind: 'agent', id: named.id }
      whoStarted = `Its row names the agent "${named.handle}" as its starter.`
    }
  }
  const mark = row.cardChosenBy
  const readAs = row.role ?? A_ROW_WITH_NO_ROLE_READS_AS
  const heldCard =
    row.role === null
      ? `Its row holds no card word, so it is read as the ${A_ROW_WITH_NO_ROLE_READS_AS} card`
      : `Its row holds the ${row.role} card`
  const notWritten =
    roleSent !== undefined && roleSent !== row.role ? ` The ${roleSent} card this registration named was not written.` : ''
  return {
    startedBy,
    startedBySays: `${notChanged} who started it. ${whoStarted}`,
    startedByRun: row.startedByRun,
    startedByRunSays:
      row.startedByRun === null
        ? `${notChanged} which run started it, and its row records none.`
        : `${notChanged} which run started it. This is the run its row records.`,
    cardReadAs: readAs,
    card: {
      role: row.role,
      chosenBy: mark,
      says:
        `${notChanged} its card. ${heldCard}; ${whoChoseTheCardSays(mark, theHandleOfTheChooser(mark))}.` +
        `${notWritten} No card message was sent, because its card did not change.`,
    },
  }
}

function theCardTheyHold(
  handle: string,
  role: unknown,
  chosenBy: unknown,
  workspaceId: string | null,
  whatTheRoutesSay: WhatTheRoutesSay,
): TheCardTheyHold {
  const written = role === null || role === undefined || role === '' ? null : String(role)
  const decl = theRoleCards()
  const readAs = written ?? A_ROW_WITH_NO_ROLE_READS_AS
  // THE PERIOD, AND THE ACTS MADE UNDER IT. Criterion P19. `holding` is the grant that holds now,
  // or null. When none holds, the last grant the person made and ended is shown instead, so what a period
  // allowed is still readable after it ends; `asAScreenReadsIt` is the same reader the card and the
  // profile already use, so the two cannot name the end differently.
  const holding = whatThisAgentIsDoingForYou(handle)
  const lastEver = holding === null ? theGrantEverMadeTo(handle) : null
  const thePeriod = holding ?? (lastEver === null ? null : asAScreenReadsIt(handle, lastEver))
  return {
    role: written,
    readAs,
    says: written === null ? NO_ROLE_SET : null,
    // WHO CHOSE IT, criterion P75, or null because nobody recorded it. Null is NOT read as either
    // answer here: a row written before the mark existed carries a word that may have been a
    // starter's choice or may be the word the row was read as, and the page says so.
    chosenBy: theMarkSaying(chosenBy),
    // AND THE CHOOSER'S HANDLE, read from its row, for the sentence a page draws (wave rule 5). Null
    // where a person or the rule chose it, where nobody recorded who did, and where no single agent
    // row answers; `whoChoseTheCardSays` then draws the stored id.
    chosenByHandle: theHandleOfTheChooser(theMarkSaying(chosenBy)),
    cardsOnOffer: decl.cards.map((one) => one.name),
    card: theCardDrawn(decl, readAs),
    elevation: mayBeElevated(decl, written)
      ? {
          rule: decl.elevation,
          holding,
          // THE ZONE THE OFFICE WRITES ITS STAMPS IN, so the page can write a raise's end on the same clock.
          officeTimeZone: theClockZone(),
          period:
            thePeriod === null
              ? null
              : { grant: thePeriod, holds: holding !== null, acts: actsUnderThePeriod(thePeriod.id, workspaceId, whatTheRoutesSay) },
        }
      : null,
    // THE NOTEBOOK AND ITS NUMBERS, criterion N3. On the one card that can act for the person and
    // on no other, which is the same question `elevation` above asks and is asked the same way.
    // Counted from the record on this read; nothing is stored.
    notebook: mayBeElevated(decl, written) && workspaceId !== null ? theNotebookOnACardFor(workspaceId, handle) : null,
  }
}

/**
 * THE CARD, AS A CITIZEN'S PAGE DRAWS IT. Criterion P71.
 *
 * THE PICTURE IS THE CARD'S AND NOT THE AGENT'S. `theFirstPortraitOf` is the same rule the Role
 * cards page and the copier use, so the card a reader sees here and the card at #/roles are one
 * picture from one place. An agent's own chosen picture is drawn at the top of this page as its
 * face; putting it on the card would say the agent had painted its role, which nobody did.
 *
 * NULL WHERE THE DECLARATION HOLDS NO SUCH CARD. That is a real state and it has happened: the
 * investigator rung left the tree and rows written while it existed
 * still carry the word. The page says the card is gone rather than drawing a blank one.
 */
function theCardDrawn(decl: RolesDeclaration, name: string): TheCardDrawn | null {
  const declared = decl.cards.find((one) => one.name === name)
  if (declared === undefined) return null
  // THE DUTIES AND THE FLOW IN THE OFFICE'S WORDS for the card, where its words record holds them.
  const card = theCardInTheOfficesWords(declared)
  return { name: card.name, duties: card.duties, flow: card.flow ?? null, portrait: theFirstPortraitOf(card.name), rung: card.rung, steps: decl.tree.length }
}

/**
 * WHICH OF THE READER'S CONTACT GROUPS THIS PARTICIPANT SITS IN, or null because they are in none.
 *
 * IT ASKS THE CONTACTS LIST RATHER THAN THE PLACEMENT ROWS. A group somebody moved a contact into is
 * one row; a contact nobody moved is in the group its kind puts it in and there is no row at all.
 * Only `placeTheContacts` knows both halves of that rule, so this calls it with the one contact it
 * is asking about rather than reading the table and re-deciding.
 *
 * NULL IS A REAL ANSWER AND HAPPENS THREE WAYS: nobody is reading as a registered participant, the
 * reader is looking at their own page, or the participant is Mole Office, which writes system lines
 * and is on nobody's contacts list.
 *
 * NO MESSAGES ARE HANDED IN, AND THE GROUP IS THE SAME (problem xiv1cwqWTmhb). `contactsFor` gives a
 * row to every registered participant but the reader, and to Mole Office only when the person has an
 * upgrade notice, whatever the messages say; the messages give each row its last line, its unread
 * count and its fold. The group reads only who the row is for, and then the reader's own groups and
 * placements. So an empty list gives the same row for this participant, and the pool, every message
 * of every project, is not read. Measured 18 October 2026 on a made-up office of about 12,500
 * messages, reading it was 175 to 199 ms of one profile. Held by
 * tests/a-profiles-group-is-found-without-reading-the-messages.test.ts.
 */
function theGroupTheyAreIn(
  who: ParticipantRef,
  workspaceId: string,
  reader: ParticipantRef | null,
  aliases: TheFiledAliases,
): { key: string; name: string; made: boolean } | null {
  if (reader === null) return null
  const lines = contactsFor(reader, everybodyRegistered(aliases), EVERY_PROJECT, [])
  const mine = lines.find((line) => line.who !== null && line.who.kind === who.kind && line.who.id === who.id)
  if (mine === undefined) return null
  const asked = asAContactToPlace(mine)
  // ONLY THE GROUP IS READ, not the place in it, so whether the contact is online is not read.
  const at = placeTheContacts(reader, [asked], () => false).find((one) => one.key === asked.key)
  if (at === undefined) return null
  const group = groupsOf(reader).find((one) => one.key === at.group)
  return group === undefined ? null : { key: group.key, name: group.name, made: group.made }
}

/**
 * THE WORLD THIS WORLD'S ROLL SAYS THEY BELONG TO, and one sentence saying how sure that is.
 *
 * A registration in a world is citizenship of that world (criterion C1), and both registries are
 * per database — so this answers about the database this server holds and about no other. It says
 * so, because a reader looking at a list of worlds could otherwise take one name as the whole
 * answer. Two rows have no world at all: one written before the column existed, and one in a
 * database whose creation time the filesystem does not record.
 *
 * THE NAME OF THAT WORLD is looked up by `theWorldsThisWorldCanName` in lib/office.ts: this
 * database's own table first, then, in a world that is not the office, the office's list read from
 * its mirror. A citizen copied from the office has the office as home, and a world's copy carries no
 * row for the office, so without the mirror that name would be lost. The sentence says which list
 * the name came from, or which lists were looked in when none did.
 *
 * `look` is the mirror a world may read. Exported with it so a test can hand it a mirror it wrote.
 */
export function theCitizenship(
  homeWorld: string | null,
  look?: { file: string | null; why: string },
): { citizenOf: CitizenOf | null; citizenshipSays: string; citizenshipSaid: DevSaying | null } {
  if (homeWorld === null) {
    return {
      citizenOf: null,
      citizenshipSays: CITIZENSHIP_SAYS.unrecorded,
      citizenshipSaid: null,
    }
  }
  const { nameOf, officesList } = look === undefined ? theWorldsThisWorldCanName() : theWorldsThisWorldCanName(look)
  const named = nameOf(homeWorld)
  const world = named?.world ?? null
  return {
    citizenOf: { databaseIdentity: homeWorld, name: world?.name ?? null, kind: world?.kind ?? null },
    ...theCitizenshipSentence(named, officesList),
  }
}

/** The sentence beside a citizen's world, for each place its name could have come from. */
function theCitizenshipSentence(named: AWorldNamed | null, officesList: TheOfficesList): {
  citizenshipSays: string; citizenshipSaid: DevSaying | null
} {
  const constant = (citizenshipSays: string) => ({ citizenshipSays, citizenshipSaid: null })
  const coded = (citizenshipSaid: DevSaying) => ({ citizenshipSays: inEnglish(citizenshipSaid), citizenshipSaid })
  if (named !== null && named.from === 'this database') return constant(CITIZENSHIP_SAYS.here)
  if (named !== null) {
    // Only a world that read the office's list gets a name from it.
    return officesList.state === 'read'
      ? coded(saying('profileWorldNamedByOffice', { at: officesList.writtenAt }))
      : constant(CITIZENSHIP_SAYS.named)
  }
  if (officesList.state === 'this is the office') return constant(CITIZENSHIP_SAYS.officeHasNoRow)
  if (officesList.state === 'read') return coded(saying('profileWorldMissingFromOffice', { at: officesList.writtenAt }))
  return coded(saying('profileWorldListUnread', { why: officesList.why }))
}

/** Every trip this world holds a row for, newest first, and one sentence about how complete that is. */
function theTrips(who: ParticipantRef): { visits: Visit[]; visitsSay: string } {
  const mine = visitsHere().filter((one) => one.visitor.kind === who.kind && one.visitor.id === who.id)
  mine.sort((a, b) => b.since.localeCompare(a.since))
  return {
    visits: mine,
    visitsSay: theOfficeIsInThisDatabase() ? VISITS_SAY.everyTrip : VISITS_SAY.thisWorldsTrips,
  }
}

// ============================================================================ one agent, restored

/**
 * HOW BIG THIS READ IS ALLOWED TO BE, in estimated tokens. F15 point 4 and the start ceiling of
 * proposal ide2Dq0I7C08: this read is on the path a returning agent takes, beside GET /api/onboarding,
 * so it is held to the same kind of budget. The ceiling for the whole start is 15,000 estimated
 * tokens until the owner says otherwise; 3,000 is what the onboarding read already fits in, and this read
 * is meant to be the other half of the same start rather than a second brief.
 */
export const RESTORE_TOKEN_BUDGET = 3000

/**
 * How much of the project's open-loop reading to gather before narrowing to this agent's own.
 *
 * THE MEMBERSHIP IS `openLoopsFor`'S AND DOES NOT MOVE. That reading cuts itself to 16 KB at the
 * length it can afford, which is right for a page somebody reads and wrong here: narrowing a cut
 * list to one agent could miss that agent's own work because the cut came first. So this asks the
 * same reading for more room and then narrows, and the reply is capped below at a handful of rows.
 */
const RESTORE_OPEN_LOOP_BYTES = 64 * 1024

/** How many rows of each list this reply draws. The count beside each says what was not drawn. */
const RESTORE_LOOP_ROWS = 8
const RESTORE_CHANGED_ROWS = 5

/**
 * WHAT A KEY NOBODY HOLDS IS ANSWERED, and why it names no agent. A revoked key and a key that was
 * never issued are the same answer: the office keeps only the SHA-256 of a key it issued, so it
 * cannot tell them apart, and it must not fall through to answering by the handle.
 */
const NOTHING_HOLDS_THE_KEY =
  'Nobody holds this key. It names no agent here, so this read answers about no agent and does not fall ' +
  'back to the handle on the request. The office keeps only the SHA-256 of every key it issued, so a ' +
  'revoked key and a key that was never issued are answered the same way.'

/** A key that is held, but by the person or by the office, names no agent. */
const A_KEY_THAT_IS_NOT_AN_AGENTS =
  'This key is not an agent’s key. This read answers about one agent, and only a key an agent holds names ' +
  'one; a person’s key and the office’s own key name no agent, so nothing about an agent is answered here.'

/** Neither a handle in the path nor a key on the request: nothing names an agent at all. */
const RESTORE_NEEDS_A_NAME =
  'This read answers about one agent, and the request named none: send the agent’s key as x-mole-office-key ' +
  'on GET /api/restore, or name the agent in the path at GET /api/restore/:handle. Nothing was answered ' +
  'about anybody.'

/**
 * WHAT THIS READ DROPS WHEN IT IS OVER BUDGET, in order, and where each thing comes back from.
 *
 * Declared once so `leftOut` cannot announce a rung this handler does not drop, and so the order is a
 * decision somebody made rather than whatever the code happened to do. The card stays last because a
 * returning agent without its card has nothing to work from.
 */
const RESTORE_LADDER: readonly { rung: string; what: string; ask: string }[] = [
  {
    rung: 'changed-since-rows',
    what: 'the records that changed since your last session ended, leaving the count',
    ask: 'GET /api/changes or GET /api/records',
  },
  {
    rung: 'unfinished-rows',
    what: 'the rows of your own unfinished work, leaving the count',
    ask: 'GET /api/open-loops',
  },
  {
    rung: 'last-session-detail',
    what: 'what your last session said it was doing and why it ended, leaving when and how',
    ask: 'GET /api/participants/agent/:id/profile',
  },
  {
    rung: 'card-duties',
    what: 'what the card is for, leaving its name and its rung',
    ask: 'GET /api/roles or GET /api/participants/agent/:id/profile',
  },
]

/**
 * THE CARD THIS AGENT HOLDS, from the one reading the profile already uses.
 *
 * A restore read can have no project. `theCardTheyHold` takes that case: the notebook is null because
 * a notebook is kept in a project, and the acts done under a period are read with no project, which is
 * the office-wide list. So the rung, the duties, the role word and the period are the same reading
 * this reply and the profile use, and neither can differ from the other.
 */
function theCardForRestore(
  held: Record<string, unknown>,
  handle: string,
  workspaceId: string | null,
  whatTheRoutesSay: WhatTheRoutesSay,
): TheCardTheyHold {
  return theCardTheyHold(handle, held['role'], held['cardChosenBy'], workspaceId, whatTheRoutesSay)
}

/** One open loop as this reply draws it: the reading's own fields, at the length it carried. */
function aRestoreLoopRow(loop: RankedLoop): Record<string, unknown> {
  return {
    id: loop.id,
    kind: loop.kind,
    says: loop.says,
    state: loop.state,
    progress: loop.progress,
    whoseMove: loop.whoseMove,
    modules: loop.modules,
    lastChanged: loop.lastChanged,
    rank: loop.rank,
    score: loop.score,
    ranking: loop.ranking,
  }
}

/** The last session that ran as this agent, with how it ended and what it said it was doing. */
interface TheLastSessionOnTheWire {
  id: string
  title: string
  when: string
  state: string
  endedAt: string | null
  endedHow: string | null
  endedBecause: string | null
  doing: string | null
  endedSays: string
}

/**
 * THE SESSION RECORD ITSELF, READ FOR HOW IT ENDED. `theAgentsRuns` finds the newest run bound to
 * this agent through `ranAs`; the end is on that same record's own data, written together by the one
 * close path (`closedAt`, `closedBecause`, `closedHow`). Nothing here infers an end from a state
 * word: a session with no `closedAt` is said to have no recorded end.
 */
function theLastSessionFrom(run: OneOfItsRuns): TheLastSessionOnTheWire {
  const record = getRecord(run.id)
  const data = (record?.data ?? {}) as Record<string, unknown>
  const word = (key: string): string | null => {
    const value = data[key]
    return typeof value === 'string' && value.trim() !== '' ? value : null
  }
  const endedAt = word('closedAt')
  const endedHow = word('closedHow')
  const endedBecause = word('closedBecause') ?? word('detail')
  return {
    id: run.id,
    title: run.title,
    when: run.when,
    state: run.state,
    endedAt,
    endedHow,
    endedBecause,
    doing: word('doing'),
    endedSays:
      endedAt === null
        ? 'Nothing recorded an end for this session. It may still be running, or it ended without a close.'
        : `It ended at ${endedAt}${
            isClosedHow(endedHow)
              ? `: ${CLOSED_BECAUSE[endedHow].sentence}`
              : ', and nothing recorded how it ended'
          }`,
  }
}

/**
 * ONE AGENT'S OWN CONTEXT, RESTORED BY WHO IT IS. F15 point 4.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE AGENT IS NAMED, AND WHY THE TWO WAYS IN DO NOT BLEND
 * ---------------------------------------------------------------------------------------
 *
 * The key on the request is proof of the agent that holds it, and a handle is only a name anybody
 * may write. So a key decides the agent on its own; a handle decides only when no key was sent; and
 * a key sent beside a handle that is somebody else's is a contradiction, refused while naming both.
 * A key nobody holds answers that, and never falls through to the handle — otherwise a caller with a
 * mistyped key would be handed the agent whose name it guessed.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROJECT, AND WHY `default` IS NEVER THE ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * `resolveProject` is the one reading of which project a request or a working directory is in, and
 * it answers five ways. Two of them name a project: the request named one with the workspace header,
 * or a working directory that was given matched a registered repository root or work area. The other
 * three name none — nothing matched, more than one matched equally well, and the request named
 * nothing at all. That last one is where `resolveProject` answers `default`, and this read does not
 * take it: a returning agent told it works in the default project would go to a project that holds
 * nothing, which is the failure F15 exists to end.
 */
async function theRestore(
  req: FastifyRequest,
  claimedHandle: string | null,
  whatTheRoutesSay: WhatTheRoutesSay,
): Promise<Record<string, unknown>> {
  refuseTheOldWarrantHeader(req)
  const q = parse(restoreQuery, req.query ?? {}, 'The restore read takes no other options:')
  const directory = q.directory === undefined ? null : resolve(q.directory)

  // ---- who this is about, by key or by handle, and the two may not disagree
  const keyWasSent = theHashOfTheKeyOnThisRequest(req) !== null
  const proof = keyWasSent ? howThisRequestProvedItself(req) : undefined
  let handle: string
  if (keyWasSent) {
    if (proof === undefined) throw new PanelError(NOTHING_HOLDS_THE_KEY, 404)
    if (proof.how !== 'an-agent-key') throw new PanelError(A_KEY_THAT_IS_NOT_AN_AGENTS, 403)
    // THE KEY'S HOLDER IS RESOLVED, NOT ASSUMED TO BE AN ID. `held_keys.whose_id` holds the holder's
    // id after piece I-5 and held its handle before it, and the one reader answers both. A holder
    // string that names two agents is refused there rather than picked between.
    const fromTheKey = theAgentAnArrivingReferenceNames(proof.whoseId, 'reading')
    if (claimedHandle !== null && fromTheKey !== null) {
      // THE PATH IS RESOLVED THE SAME WAY, with the key at step 1 so the agent's own name settles
      // the case a name alone cannot. A path that names a different agent is refused, naming both.
      const fromThePath = theAgentAnArrivingReferenceNames(claimedHandle, 'reading', proof.whoseId)
      if (fromThePath === null || fromThePath.agent.id !== fromTheKey.agent.id) {
        // THE KEY'S HOLDER IS NAMED BY THE HANDLE ON ITS ROW (wave rule 5), and that handle is also
        // what to ask for: the path is resolved with the key at step 1, so the holder's own handle
        // always names the holder here, live or retired, whatever else bears that string.
        const holder = fromTheKey.agent.handle
        throw new PanelError(
          `This request carries the key of "${holder}" and names "${claimedHandle}" in the path. ` +
            `Those are two different agents, so the request contradicts itself and is refused. Send the key of ` +
            `"${claimedHandle}", or ask for "${holder}". Nothing was written.`,
          400,
        )
      }
    }
    handle = fromTheKey === null ? proof.whoseId : fromTheKey.agent.id
  } else {
    if (claimedHandle === null) throw new PanelError(RESTORE_NEEDS_A_NAME, 400)
    // THE KEYLESS PATH NAMES AN ARRIVING REFERENCE, which may be an id or a handle. Reading it
    // through the one resolver is what stops a keyless restore addressed by handle answering 404
    // for an agent that exists once its id is no longer its handle.
    const found = theAgentAnArrivingReferenceNames(claimedHandle, 'reading')
    if (found === null) {
      throw new PanelError(`No agent in this installation answers to "${claimedHandle}".`, 404)
    }
    handle = found.agent.id
  }

  const held = readParticipant({ kind: 'agent', id: handle })
  if (held === null) {
    throw new PanelError(`No agent in this installation answers to "${handle}".`, 404)
  }
  const heldData = held as unknown as Record<string, unknown>

  // ---- which project this is about, and how that was worked out
  const claim = workspaceFrom(req)
  const resolved = claim.stated || directory !== null ? resolveProject(claim, directory) : null
  // `default` is treated as no project at all, so an answer about the default project can never be
  // mistaken for an answer about one this agent was put in.
  const projectId = resolved === null || resolved.id === null || resolved.kind === 'default' ? null : resolved.id
  const howWorkedOut =
    resolved === null
      ? 'The request named no project with x-mole-office-workspace and gave no working directory, so no ' +
        'project was worked out.'
      : resolved.because
  const workspace = projectId === null ? null : getWorkspace(projectId)

  // ---- the card
  // `theCardTheyHold` is asked with the agent's HANDLE, which is the name a grant is recorded
  // under; `handle` above is the registry id the resolver answered, which is a different string
  // once an agent's id is not its handle.
  const card = theCardForRestore(heldData, String(heldData['handle']), projectId, whatTheRoutesSay)

  // ---- what is left unfinished that is this agent's own
  let ownLoops: RankedLoop[] = []
  let projectOpenLoops: number | null = null
  if (projectId !== null) {
    // THE ATTENTION RULE RUNS FIRST, ON ITS OWN THREAD, and the loops are read after it
    // (`theReadingOpenWorkIsRankedBy`, problem CtH8CGBkE5Bz).
    const ranking = await theReadingOpenWorkIsRankedBy(projectId)
    const loops = openLoopsFor({ workspaceId: projectId, budgetBytes: RESTORE_OPEN_LOOP_BYTES })
    projectOpenLoops = loops.attachment.openLoopsInProject
    ownLoops = rankOpenWork(loops, ranking).filter((loop) => {
      // THE LEDGER STAMP IS A STORED REFERENCE, read back now. `sameAgent` is the one comparison
      // that tells the restoring agent from the one that filed the loop, whether the stamp is the
      // agent's id or the handle it wrote under.
      const filedBy = whoFiled(projectId, loop.id)
      return filedBy !== null && sameAgent(filedBy, { type: 'agent', id: handle })
    })
  }

  // ---- the last session that ran as this agent
  const agentRecordId = projectId === null ? null : recordForAgentIn(String(heldData['id']), projectId)
  const runs = projectId === null ? null : theAgentsRuns(agentRecordId, projectId)
  const newestRun = runs === null || runs.runs.length === 0 ? null : runs.runs[0] ?? null
  const lastSession = newestRun === null ? null : theLastSessionFrom(newestRun)
  const lastSessionSays =
    projectId === null
      ? 'No project was worked out, so no session that ran as this agent was looked for.'
      : runs === null
        ? 'No session that ran as this agent was looked for.'
        : runs.runsSay

  // ---- what changed since that session ended
  let changedSince: string | null = null
  let changedCount: number | null = null
  let changedSays: string
  const changedAll: { id: string; kind: string; title: string; updatedAt: string }[] = []
  if (projectId === null) {
    changedSays = 'No project was worked out, so nothing could be counted as changed.'
  } else if (lastSession === null) {
    changedSays =
      'Nobody has run as this agent in this project before, so there is no session to count changes from. ' +
      'That is not the same answer as nothing having changed since one.'
  } else if (lastSession.endedAt === null) {
    changedSays =
      'The last session that ran as this agent has no recorded end, so nothing can be counted since it.'
  } else {
    changedSince = lastSession.endedAt
    const after = listRecords({ workspaceId: projectId }).filter(
      (one) => one.id !== lastSession.id && one.updatedAt.localeCompare(changedSince as string) > 0,
    )
    after.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    changedCount = after.length
    for (const one of after) {
      changedAll.push({ id: one.id, kind: one.kind, title: one.title, updatedAt: one.updatedAt })
    }
    changedSays =
      changedCount === 0
        ? `Nothing in "${projectId}" has changed since ${changedSince}, when your last session ended.`
        : `${String(changedCount)} record${changedCount === 1 ? ' has' : 's have'} changed in "${projectId}" ` +
          `since ${changedSince}, when your last session ended.`
  }

  const unfinishedSays =
    projectId === null
      ? 'No project was worked out, so no unfinished work could be looked for.'
      : ownLoops.length === 0
        ? `No open work in "${projectId}" was filed by this agent. The project holds ` +
          `${String(projectOpenLoops ?? 0)} open loop${projectOpenLoops === 1 ? '' : 's'} in all, and none of ` +
          'them was filed by this agent.'
        : `${String(ownLoops.length)} open loop${ownLoops.length === 1 ? '' : 's'} in "${projectId}" ` +
          `${ownLoops.length === 1 ? 'was' : 'were'} filed by this agent, out of ${String(projectOpenLoops ?? 0)} ` +
          'open in the project. An open loop is a live task, problem, idea, direction, obligation or ' +
          'unsettled proposal whose own stored state does not say it has ended.'

  const role = heldData['role'] === null || heldData['role'] === undefined ? null : String(heldData['role'])
  const roleReadAs = role ?? A_ROW_WITH_NO_ROLE_READS_AS

  // ---- the body, its ladder, and then its own size.
  const leftOut: { rung: string; what: string; ask: string }[] = []
  let carriedLoops = ownLoops.slice(0, RESTORE_LOOP_ROWS).map(aRestoreLoopRow)
  let carriedChanged = changedAll.slice(0, RESTORE_CHANGED_ROWS)
  let carriedLastSession = lastSession
  let carriedCard = card

  const bodyNow = (): Record<string, unknown> => ({
    agent: {
      kind: 'agent',
      id: String(heldData['id']),
      handle: String(heldData['handle']),
      name: String(heldData['name']),
      addressAs: held.addressAs,
      role,
      roleReadAs,
      roleSays: whatAnAgentsAnswerSaysOfItsCard(String(heldData['id']), role),
      retired: heldData['retired'] === true,
      runtime: heldData['runtime'] === null || heldData['runtime'] === undefined ? null : String(heldData['runtime']),
    },
    card: carriedCard,
    project: {
      id: projectId,
      title: workspace === null ? null : workspace.title,
      howWorkedOut,
      asked: { workspaceHeader: claim.stated, directory },
    },
    unfinished: {
      loops: carriedLoops,
      count: projectId === null ? null : ownLoops.length,
      shown: carriedLoops.length,
      projectOpenLoops,
      says: unfinishedSays,
    },
    lastSession: carriedLastSession,
    lastSessionSays,
    changedSince: {
      since: changedSince,
      count: changedCount,
      records: carriedChanged,
      shown: carriedChanged.length,
      says: changedSays,
    },
    leftOut,
    leftOutNote:
      leftOut.length === 0
        ? 'Nothing was left out of this read: it fits the budget whole.'
        : `${String(leftOut.length)} thing${leftOut.length === 1 ? ' was' : 's were'} left out to keep this ` +
          'read inside its budget, and each one names the request that fetches it back.',
  })

  const measure = (body: Record<string, unknown>): { characters: number; bytes: number; tokens: number } => {
    const text = JSON.stringify(body)
    return { characters: text.length, bytes: Buffer.byteLength(text, 'utf8'), tokens: tokensEstimatedFor(text.length) }
  }
  const fits = (): boolean => measure(bodyNow()).tokens <= RESTORE_TOKEN_BUDGET
  for (const rung of RESTORE_LADDER) {
    if (fits()) break
    if (rung.rung === 'changed-since-rows') {
      carriedChanged = []
    } else if (rung.rung === 'unfinished-rows') {
      carriedLoops = []
    } else if (rung.rung === 'last-session-detail') {
      carriedLastSession =
        lastSession === null ? null : { ...lastSession, doing: null, endedBecause: null }
    } else {
      carriedCard =
        card.card === null ? card : { ...card, card: { ...card.card, duties: '', flow: null } }
    }
    leftOut.push({ ...rung })
  }

  // Two passes, because writing the count into the body changes the body's length by the digits of
  // the count; the second pass measures the body the caller actually receives.
  const body = bodyNow()
  const first = measure(body)
  const size = {
    characters: first.characters,
    bytes: first.bytes,
    tokensEstimated: first.tokens,
    charsPerTokenAssumed: CHARS_PER_TOKEN,
    budgetTokensEstimated: RESTORE_TOKEN_BUDGET,
    fits: first.tokens <= RESTORE_TOKEN_BUDGET,
    tokensAreAnEstimate: theTokenEstimateSentence(),
  }
  const withSize = { ...body, size }
  const second = measure(withSize)
  size.characters = second.characters
  size.bytes = second.bytes
  size.tokensEstimated = second.tokens
  size.fits = second.tokens <= RESTORE_TOKEN_BUDGET
  return withSize
}

// ============================================================================ the routes

/**
 * WHAT A STARTER SENDS TO REGISTER THE AGENT IT STARTED.
 *
 * `startedBy` IS NOT IN HERE ON PURPOSE. It is the caller, read from the actor headers. A body field
 * would let a caller name a starter that has not agreed to answer for the agent, which is the whole
 * of what a starter is.
 */
const aStartedAgent = z
  .object({
    handle: z.string(),
    name: z.string(),
    // THE CARD IS OPTIONAL, AND LEAVING IT OUT IS NOT AN OMISSION. Criterion P65: an agent registers
    // as a worker by default. A
    // starter that names none registers a row with no card, which every refusal in this product
    // already reads as the worker card, and a screen says nobody wrote one rather than drawing the
    // word as a choice somebody made. Naming one still works and is still checked.
    role: z.string().optional(),
    runtime: z.string().optional(),
    notes: z.string().optional(),
    workArea: z.array(z.string()).optional(),
    startedFor: z.string().optional(),
    // THE CHAPTERS OF THE CODE OF LAW THIS AGENT IS POINTED AT. Criterion C14. `unknown` here and
    // read below, because the line is loose input on purpose — a number, a chapter name, or either
    // with a level after a colon — and what is stored is always a number and a rung.
    chapters: z.array(z.unknown()).optional(),
    // THE LANGUAGE THE AGENT READS, so its card's handbook goes in that language.
    // Left out, the office does not know, and the handbook goes in every language.
    language: z
      .string()
      .refine((word) => isLanguage(word), {
        message: `language is one of ${Object.keys(LANGUAGES).join(', ')}, or left out when nobody knows. Nothing was written.`,
      })
      .optional(),
    // NO KEY OF ITS OWN. True makes no key for the agent and marks its row, so a write in its name is taken only with a
    // run key or the office's key (lib/run-keys-only.ts). False and absent register it the ordinary way.
    noKey: z.boolean().optional(),
  })
  .strict()

/**
 * WHAT A REGISTRATION WITH NO KEY OF ITS OWN IS ANSWERED IN PLACE OF A KEY. Which runs are given a run key is decided by
 * `mintARunKey` in src/server/api/records.ts: a run the office starts, or a hand start naming a live run of its
 * registered starter with --asked-by and --brief, proved by the starter's own agent key. A person who starts an agent files its runs with the person's key, which mints none, so the
 * second half is said only where the starter is an agent.
 */
function whatARegistrationWithNoKeyIsAnswered(handle: string, starter: ParticipantRef): string {
  return (
    `No key was made for "${handle}", because it was registered with no key of its own. ` +
    (starter.kind === 'agent'
      ? "A run of it is given a run key when the office starts the run, or when a hand start names a live run of its registered starter with --asked-by and supplies --brief."
      : 'A run of it is given a run key when the office starts the run.')
  )
}

const retireBody = z
  .object({
    // THE `error` IS ON THE TYPE AND NOT ONLY ON `min`, because a MISSING key never reaches `min`:
    // zod reports "expected string, received undefined" for it, and the sentence a person needs is
    // the same in both cases. Measured 7 September 2026, when only `min` carried one.
    // THE REASON IS TRIMMED BEFORE IT IS COUNTED, so a reason of spaces, tabs or line breaks only is
    // refused here with the same sentence, before the door writes anything (problem HeqtGKcycLvq).
    // What the door stores is the trimmed reason.
    because: z
      .string({ error: 'a retirement says why, so a reader can tell a closed test agent from a live one.' })
      .trim()
      .min(1, { error: 'a retirement says why, so a reader can tell a closed test agent from a live one.' })
      .max(500),
  })
  .strict()

const RETIRE_NOTE =
  'RETIRE AN AGENT, so that a reader can tell a closed test agent from a live one. Body {"because":…}, and the ' +
  'reason is required. THE ROW IS KEPT AND NOT DELETED — it reads ' +
  'retired, and the Embassy folds it away. The handle is free again (criterion I3): ' +
  'a later registration under it makes a new agent with an id of its own, and the retired row ' +
  'keeps its id, its messages and its history. Mole Office\'s own row is refused to every caller, the person included. ' +
  'The person or a raised agent may retire any other row. A card appointed by ' +
  'the person is refused to everyone else. Otherwise its starter may retire it, then an agent with a strictly higher card. ' +
  'Removing the last live agent record asks the same rule and says so in its reply. While the gate ' +
  'who-retires-an-agent is off, any agent proved by its own key may also retire any agent but Mole Office\'s own row, ' +
  'and is counted. ' +
  'The id may be the handle or the registry id.'

/**
 * WHAT A SESSION A PERSON STARTED SENDS TO REGISTER ITSELF. F15 point 2; problem pHFu8nivPZ_O.
 *
 * `workingDirectory` is required because it is how the project is found: the door matches it against
 * the repositories and work areas already registered, and where nothing matches it asks which
 * project rather than filing the agent in `default`. `requestedRole` is an ask, never a grant — an
 * agent cannot give itself a card (mz5ddKDITE3j), so the door writes the worker card and raises the
 * ask for the person's press. `notes` is the folder where the agent keeps its own notes, written on the
 * agent record as `/agents/started` writes it.
 */
const selfRegistrationBody = z
  .object({
    handle: z.string().min(1),
    name: z.string().min(1),
    runtime: z.string().optional(),
    workingDirectory: z.string().min(1),
    workArea: z.array(z.string()).optional(),
    requestedRole: z.string().optional(),
    because: z.string().optional(),
    doing: z.string().optional(),
    providerSession: z.string().optional(),
    machine: z.string().optional(),
    startFolder: z.string().optional(),
    notes: z.string().optional(),
    // AN EXISTING AGENT ASKING FOR A NEW KEY because it lost its own. Problem x8ktQfHS5yGr; the ask,
    // the grant and the one new key are in src/server/lib/newkey.ts.
    newKey: z.boolean().optional(),
    // THE ONE-TIME SECRET a first new-key ask was answered with, sent by the ask that collects the key.
    askSecret: z.string().optional(),
  })
  .strict()


/**
 * WHAT REGISTER-MYSELF ANSWERS AN AGENT THAT ASKS FOR A NEW KEY. It follows problem x8ktQfHS5yGr and a
 * decision. The ask, the grant and the key are in src/server/lib/newkey.ts; this only says it.
 */
function theAnswerToANewKeyAsk(
  agent: RegisteredAgent,
  workspaceId: string,
  actor: Actor,
  said: WhatASessionSaysAboutItself,
  askSecret: string | null,
  askedFrom: WhereAnAskCameFrom,
  reply: FastifyReply,
): Record<string, unknown> {
  const asked = askForANewKey({ workspaceId, agent, actor, because: said.doing, secret: askSecret, askedFrom })
  if (asked.outcome === 'the-key') {
    void reply.code(200)
    return {
      newKey: true,
      request: asked.requestId,
      agent: agent.handle,
      keySays: THE_AGENT_KEY_IS_SHOWN_ONCE,
      headers: theSelfRegistrationHeaders(agent.handle, workspaceId, actor.sessionId ?? null, asked.key),
      says:
        `This is the new key for "${agent.handle}", answered once, on the granted ask ${asked.requestId}. The grant ` +
        'revoked every key it held before. Asking again answers no key: it files a new ask, which waits for a new grant.',
    }
  }
  const whoAnswers =
    asked.answersTo.kind === 'person'
      ? 'The person answers it with one press on the ask\'s own page.'
      : `The person answers it with one press on the ask's own page, or "${
          theOneAgentAStringNames(sqlite, asked.answersTo.id)?.handle ?? asked.answersTo.id
        }", the agent that started "${agent.handle}", grants it at POST /api/roles/requests/${asked.requestId}/grant ` +
        'sending its own key.'
  void reply.code(202)
  return {
    waiting: true,
    newKey: true,
    request: asked.requestId,
    agent: agent.handle,
    answersTo: asked.answersTo,
    headers: theSelfRegistrationHeaders(agent.handle, workspaceId, actor.sessionId ?? null, null),
    // THE ONE-TIME SECRET, answered once, on the ask that filed the request. The office keeps its SHA-256.
    ...(asked.outcome === 'filed' ? { askSecret: asked.secret } : {}),
    says:
      (asked.outcome === 'filed'
        ? `A new key for "${agent.handle}" is asked for on ${asked.requestId}. This reply carries a one-time secret, ` +
          'once: keep it, because only the ask that sends it back as "askSecret" collects the key. '
        : `A new key for "${agent.handle}" is already asked for on ${asked.requestId}, and nothing was written. `) +
      `The keys it holds work until the ask is granted. ${whoAnswers} After the grant, ask this door once more with ` +
      '"newKey": true and the secret, and it answers one new key, once.',
  }
}

/**
 * THE HEADERS A REGISTERED SESSION SENDS ON EVERY LATER REQUEST. F15 point 2.
 *
 * The workspace, the actor type and id, the session, and the key where one was answered. The key is
 * absent from every later reply: the office keeps only its SHA-256 and cannot answer it again. This
 * is written once and used by both the new-registration reply and the already-registered reply, so
 * the two cannot spell a header differently.
 */
function theSelfRegistrationHeaders(
  handle: string,
  workspaceId: string,
  sessionId: string | null,
  key: string | null,
): Record<string, string> {
  return {
    'x-mole-office-workspace': workspaceId,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(sessionId === null || sessionId === '' ? {} : { 'x-mole-office-session': sessionId }),
    ...(key === null ? {} : { [KEY_HEADER]: key }),
  }
}

/**
 * THE FOLDER A REGISTRATION ASKS TO HAVE RECORDED, in the one spelling this office stores, or null
 * because it asked for none.
 *
 * This follows part (c) of a decision.
 * `theStartFolderAsItIsStored` in src/config/start-folder.mjs is the
 * rule and writes the reason; this turns its refusal into the door's own 400. A blank string is read
 * as nobody asking, which is what the other optional fields of this body do.
 */
function theStartFolderThisRegistrationNames(written: string | undefined): string | null {
  if (written === undefined || written.trim() === '') return null
  const read = theStartFolderAsItIsStored(written)
  if (read.folder !== null) return read.folder
  throw new PanelError(
    `"startFolder" cannot be ${JSON.stringify(written)}. ${String(read.because)} Nothing was registered.`,
    400,
  )
}

/**
 * WHAT AN ASK OF A REGISTERED HANDLE IS TOLD ABOUT THE START FOLDER IT NAMES. Wave 13y round 135, item 75.
 *
 * The door writes nothing for a handle already registered. It used to say the folder "was not recorded" even when it
 * was the folder recorded for the handle, so a check of a second user read a true state as a failure. Now the folder
 * recorded already is said to be recorded, with nothing changed. Any other folder was not recorded, and the words name
 * the folder that is recorded, or say that none is. `asked` is spelled as theStartFolderThisRegistrationNames spells it,
 * which is how the record keeps it, so the two are compared as they are.
 */
export function startFolderSaysToARegisteredHandle(handle: string, asked: string, recorded: string | null): string {
  if (asked === recorded) return `"${asked}" is recorded already as this agent's start folder. Nothing changed.`
  return (
    `"${asked}" was not recorded as this agent's start folder: the handle is already registered and this door ` +
    'records no start folder for one that is. ' +
    (recorded === null ? 'No start folder is recorded for this agent. ' : `The folder recorded is "${recorded}". `) +
    `Change it at POST /api/participants/agent/${handle}/start-folder, saying why.`
  )
}

/**
 * WHAT THE REPLY SAYS ABOUT THE FOLDER IT JUST RECORDED, or null because this registration recorded
 * none.
 *
 * This follows part (c) of a decision.
 *
 * ---------------------------------------------------------------------------------------
 * IT NAMES THE CONDITION AND NEVER PREDICTS THE OUTCOME
 * ---------------------------------------------------------------------------------------
 *
 * The sentence after the first is `whatAStartFolderDoes` in src/server/lib/selfregistration.ts, which
 * the waiting item, the admit-agent act and the note of the person's press say as well.
 *
 * These words replaced the measurement's own on 24 September 2026, and the change of words is
 * in message IJ-SxOyi6Mgl. The measurement's version said the start hook "names
 * <h> for a session started there when neither its environment nor a .env names an agent", which
 * predicts one outcome where the code does four things. It is false while another live agent shares
 * the folder, false while <h> is answering in another live session (the answer to open question
 * 11, decided after those words were written), and false when the office does not answer the hook's
 * read. So the sentence now carries the whole condition, and "says why" covers all four outcomes
 * rather than naming three of them.
 *
 * THE ENVIRONMENT IS IN THE CONDITION AND NOT IN THE "OTHERWISE". When a session's environment or a
 * `.env` names an agent, the hook names THAT agent and never reads a start folder at all, so those
 * sessions are outside what this sentence is about rather than an "otherwise" of it.
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND SENTENCE, WHEN THE FOLDER IS SHARED
 * ---------------------------------------------------------------------------------------
 *
 * Two agents may hold one folder: recording it and warning is the answer to open question 12,
 * since refusing would stop the agent registering at all. The warning follows the words above without
 * contradicting them — the first says the hook names this agent only while it is the only live agent
 * registered there, and the second says who else is and that the hook therefore names none of them.
 */
function whatTheStartFolderReplySays(handle: string, folder: string | null, agentId: string | null): string | null {
  if (folder === null) return null
  const others = agentsStartingIn(folder).filter((one) => one.id !== agentId)
  const first = `"${folder}" is recorded as the folder this agent's sessions start in. ${whatAStartFolderDoes(handle)}`
  if (others.length === 0) return first
  return (
    `${first} "${folder}" is also the registered start folder of ${others.map((one) => one.handle).join(', ')}. ` +
    'While more than one live agent has it, the start hook names none of them there.'
  )
}

const SELF_REGISTRATION_NOTE =
  'A SESSION A PERSON STARTED REGISTERS ITSELF, in one request. Body {"handle":…,"name":…,"workingDirectory":…,' +
  '"runtime"?:…,"workArea"?:[…],"requestedRole"?:…,"because"?:…,"startFolder"?:…,"notes"?:…,"newKey"?:true,"askSecret"?:…}. It files the agent record, writes the worker ' +
  'card, records the work area with who registered it, files the session record with `ranAs` and the whole ' +
  'working directory, mints the agent key and answers it exactly once, and returns the headers to send on every ' +
  'later request. IT GRANTS NO CARD ABOVE WORKER: a rung above worker is written as `requestedRole` and raised as ' +
  'a `role_request` the person answers with one press, which is where the reply says the ask now waits. THE SAME ' +
  'HANDLE ASKED TWICE ANSWERS THE REGISTRATION IT HAS and makes no second row. WHICH PROJECT: the working ' +
  'directory is matched against the repositories registered to each project and the registered work areas; where ' +
  'nothing matches, the reply says so and asks which project, and NEVER falls back to `default` — that fallback ' +
  'is how the agent of 14 September 2026 came to be registered in a project that holds nothing. IT IS KEPT ON ' +
  'THIS MACHINE: a visitor is an agent from another machine, which comes in through the Embassy on a credential ' +
  'the person confirms. THE LATER OPTION, NAMED SO NOBODY REDISCOVERS IT: the session hook could register using ' +
  'the office’s own key, which it can read because it is invoked by the checkout’s absolute path. It is not ' +
  'built, and the reason is worth keeping — registering by the office’s key would make the office vouch for any ' +
  'process that ran the hook, which is the seam P83 exists to close. The person\'s press is the honest boundary. A NEW HANDLE ' +
  'IS ADMITTED AT ONCE only while the window is open and only when the request carries the person\'s key (or a ' +
  'confirmed device\'s) or an agent\'s own key; an agent\'s key records that agent as the starter. Any other new ' +
  'registration, and every one once the window is closed, lands as a waiting row on the person\'s waiting list, ' +
  'and one press by the person admits it and grants the card it asked for in the same press. ' +
  'THE FIRST ASK THAT FILES A WAITING ROW IS ANSWERED A ONE-TIME SECRET as `askSecret`, once; after the person\'s press ' +
  'only the ask sending it back as `askSecret` is answered the new agent\'s key, and any other ask naming the ' +
  'handle gets no key and changes nothing. A handle a live agent already bears keeps the ' +
  'answer above; if that agent never held a key and no admitted registration holds a secret for it, it is ' +
  'answered its key while the key window is open, and after the close its first key comes only through ' +
  '`"newKey": true`. `"newKey": true` IS AN EXISTING AGENT ASKING FOR A NEW ' +
  'KEY because it lost its own: the ask waits for the person\'s press or its registered starter\'s grant sent with ' +
  'the starter\'s own key, the grant revokes every key it holds, and the next ask answers one new key, once, ' +
  'only to an ask sending back as `askSecret` the one-time secret the first ask was answered with' +
  '. `startFolder` IS RECORDED ONLY WHEN ' +
  'THIS BODY ASKS FOR IT and never from `workingDirectory`: it is the folder the session hook names this agent ' +
  'from when neither a session\u2019s environment nor a .env does, folders are often shared, and every session a ' +
  'person starts registers itself. The reply says what was recorded and names any other live agent registered at ' +
  'the same folder, because while more than one has it the hook names none of them there. ' +
  '`notes` is the absolute folder where this agent keeps its own notes, written on its agent record; a relative ' +
  'path is refused. A registration that waits for the person\'s press keeps both folders on the waiting row, and the person\'s press ' +
  'writes them on the agent record when it admits that registration.'

const NEW_KEY_NOTE =
  'A STARTER GIVES AN AGENT IT STARTED A NEW KEY, IN ONE REQUEST. ' +
  'Body {"because"?:…}. Only the agent\'s registered starter may do this, and only sending its OWN ' +
  'agent key: a header naming the starter proves nothing, the office\'s key is not a starter\'s proof, and a ' +
  'starter\'s own starter may not re-key further down. It revokes every live key of the agent, makes one new key and ' +
  'answers it once, and writes the act as a role request already granted, so the starter is on record as the one ' +
  'who answers for it. An agent the person started asks for a new key itself, with POST /api/agents/register-myself ' +
  'and "newKey": true, and the person answers with one press.'

export async function participantRoutes(
  app: FastifyInstance,
  opts: { listRoutes?: () => readonly ApiRoute[] } = {},
): Promise<void> {
  // WHAT A DOOR'S ROUTES SAY IT DOES, for the page of a grant's acts, where the list of what the grant carries has no
  // words for the door. A server that registers these routes without the route list names such a door by no words.
  const whatTheRoutesSay: WhatTheRoutesSay = (operation) =>
    opts.listRoutes === undefined ? null : whatTheRoutesOfAnOperationSay(operation, opts.listRoutes())
  // READ ONCE, HERE, AND USED FOR BOTH THE LIMIT AND THE SENTENCE. Two calls to `maxAvatarBytes()`
  // would be the same fact worked out in two places, and a setting that changed between them would
  // put a number in the refusal that is not the number being enforced.
  const pictureLimit = maxAvatarBytes()
  const bodyLimit = bodyLimitForAPicture(pictureLimit)

  /**
   * A STARTER REGISTERS THE AGENT IT HAS JUST STARTED. Criterion P1.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THIS EXISTS WHEN `POST /api/records` ALREADY FILES AN AGENT
   * ---------------------------------------------------------------------------------------
   *
   * It does the same write, and it asks the questions a starter has to answer and a record write
   * does not. Who started it: the caller, read from the actor headers rather than sent in the body,
   * because a caller naming somebody else as the starter is naming somebody who has not agreed to
   * answer for it. What role it holds, checked against the starter's own: a starter may not give a
   * role above its own. And where it works, so that whoever checks the work can find it.
   *
   * IT IS ONE REQUEST BECAUSE THAT IS WHAT MAKES IT HAPPEN. Whoever started an agent manages it and
   * answers for it, and the way builders are started today is one tool call from a session
   * that is about to do something else. A registration that took four requests and a shape read off
   * `GET /api/kinds` is a registration that gets skipped, and 199 agent names have written into this
   * installation without one.
   *
   * THE REPLY SAYS WHAT TO GIVE IT. Three things make a started agent of any runtime able to
   * report: the handle it writes under, the run that started it, and the address of the API.
   */
  app.post('/participants/agent/:id/work-area', route('participant.change', 'remote',
    'The owner, the starter or a holder of the secretary card changes a worker’s repository-relative files and folders, recording who, how, when and why; forRun names a running run of that worker whose seal, or whose ending crashed, empties the area again.'), async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params, 'The worker')
    const body = parse(z.strictObject({ workArea: z.array(z.string()), because: z.string().min(1), forRun: z.string().min(1).optional() }), req.body, 'The work area')
    const actor = actorFrom(req)
    const { nothingWritten, ...agent } = changeWorkArea(id, workspaceOf(req), body.workArea, body.because, actor, body.forRun === undefined ? undefined : { forRun: body.forRun })
    let groupsOpened = 0
    // AND ANY OTHER AGENT ALREADY AT WORK WHOSE AREA THIS WIDENING NOW OVERLAPS GETS A GROUP WITH
    // IT. Criterion P95. The widening stands; the overlap opens the group and refuses nothing.
    if (Array.isArray(agent.workArea) && agent.workArea.length > 0) {
      // BY THE ROW'S ID, which the function reads as a stored reference by exact id. A handle a retired
      // agent and a live one share would name nobody there (criterion I3).
      groupsOpened = openTheGroupsForAWorkArea(
        { agentHandle: agent.id, area: agent.workArea, workspaceId: workspaceOf(req) },
        actor,
      ).length
    }
    return { agent, ...(nothingWritten && groupsOpened === 0 ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}) }
  })

  app.post('/participants/agent/:id/files-area', route('participant.change', 'remote',
    'The owner, the starter or a holder of the secretary card sets where a files run of a worker may land: absolute folders, each resolved with every link followed and kept both as written and as resolved, with who, how, when and why. Refused: /, a home or a folder that holds one, a hidden folder under a home, the office\u2019s data folder or a folder that holds it, and any folder inside a git working tree (acceptance finding 52).'), async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params, 'The worker')
    const body = parse(z.strictObject({ filesArea: z.array(z.string()), because: z.string().min(1) }), req.body, 'The files area')
    const workspace = workspaceOf(req)
    const { nothingWritten, ...agent } = changeFilesArea(id, workspace, body.filesArea, body.because, actorFrom(req))
    return { agent, filesArea: theFilesAreaOf(agent.id, workspace), ...(nothingWritten ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}) }
  })

  /**
   * THE FOLDER AN AGENT'S SESSIONS START IN, CHANGED BY THE THREE WHO MAY. Part (c) of
   * a decision and the answer to open question 13 say the owner, the agent's starter or a secretary may
   * change it, with a reason, and never the agent itself. The reply names who else is registered at the folder now,
   * because while more than one live agent has it the start hook names none of them there.
   */
  app.post('/participants/agent/:id/start-folder', route('participant.change', 'remote',
    'The owner, the starter or a holder of the secretary card changes the folder an agent\u2019s sessions start in, recording who, how, when and why. The session hook names that agent for a session started in exactly that folder when neither the session\u2019s environment nor a .env names one, only while it is the only live agent registered there and it is not already answering in another live session. Refused: a relative path, a path with "." or ".." in it, the root of the machine, and a home folder. The agent itself may not change it.'), async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params, 'The agent')
    const body = parse(z.strictObject({ startFolder: z.string(), because: z.string().min(1) }), req.body, 'The start folder')
    const workspace = workspaceOf(req)
    const done = changeStartFolder(id, workspace, body.startFolder, body.because, actorFrom(req))
    const nothingWritten = done.nothingWritten ? nothingWrittenSentence({ kind: 'already-stored' }) : undefined
    return {
      agent: done.agent,
      startFolder: done.startFolder,
      alsoRegisteredThere: done.alsoRegisteredThere.map((one) => one.handle),
      ...(nothingWritten === undefined ? {} : { nothingWritten }),
      says: nothingWritten ?? (
        done.alsoRegisteredThere.length === 0
          ? `"${done.startFolder}" is recorded as the folder this agent's sessions start in, and no other live agent ` +
            'is registered there.'
          : `"${done.startFolder}" is recorded as the folder this agent's sessions start in. It is also the ` +
            `registered start folder of ${done.alsoRegisteredThere.map((one) => one.handle).join(', ')}. While more ` +
            'than one live agent has it, the start hook names none of them there.'),
    }
  })

  /**
   * A SECRETARY'S OWN BROADCAST TIMES. The same three who may change
   * an agent's areas may set them, with a reason; `null` hands the secretary back to the office's times,
   * and an empty list ends its reports (the header of lib/broadcast.ts says what that stops).
   */
  app.post('/participants/agent/:id/broadcast-times', route('participant.change', 'remote',
    'The owner, the starter or a holder of the secretary card sets the times of day one secretary broadcasts at, as HH:MM in 24-hour local time, recording who, how, when and why. Body {"times":["12:00"],"because":…}; {"times":null,…} hands it back to the office\u2019s setting MOLE_OFFICE_BROADCAST_TIMES. {"times":[],…} ends this secretary\u2019s reports: it keeps its schedule and is sent no reminder, no one more reminder and no backup sentence, and it is never paused, until times are set again. The reminder before each time, the one more reminder after it, the pause and the backup sentence on the day\u2019s last time all read these. Refused: a time that is not HH:MM, and an agent with no running broadcast schedule.'), async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params, 'The agent')
    const body = parse(z.strictObject({ times: z.array(z.string()).max(48).nullable(), because: z.string().min(1) }), req.body, 'The broadcast times')
    const done = changeBroadcastTimes(id, body.times, body.because, actorFrom(req))
    const times = done.schedule.times
    const nothingWritten = done.nothingWritten ? nothingWrittenSentence({ kind: 'already-stored' }) : undefined
    return {
      agent: done.agent,
      times: times ?? null,
      change: done.change,
      ...(nothingWritten === undefined ? {} : { nothingWritten }),
      says: nothingWritten ?? (
        times === undefined
          ? 'This secretary now broadcasts at the office\u2019s times, the setting MOLE_OFFICE_BROADCAST_TIMES.'
          : times.length === 0
            ? 'This secretary now has no report times. The office sends it no reminder and does not pause it until times are set again.'
            : `This secretary now broadcasts at ${times.join(', ')}, and is reminded before each of them.`),
    }
  })

  /**
   * ONE OF A SECRETARY'S SLOTS HAS NOTHING TO REPORT. Only the secretary itself or the
   * person may say it. The office then sends no reminder for that slot and does not count it toward the pause.
   */
  app.post('/participants/agent/:id/broadcast-skip', route('participant.change', 'remote',
    'The secretary itself, or the person, says one slot of its broadcast has nothing to report. Body {"at":"2026-10-08 07:00"}: the day and one of the secretary\u2019s times. The office files it as a message, from the secretary to the person or from the person to the secretary, carrying extra.broadcastSkip; it then sends no reminder for that slot, and the line does not count toward the pause. Saying it twice writes nothing more. Refused: another agent, a slot that is not YYYY-MM-DD HH:MM, a time that is not one of the secretary\u2019s, and an agent with no running broadcast schedule.'), async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params, 'The agent')
    const body = parse(z.strictObject({ at: z.string().min(1) }), req.body, 'The slot with nothing to report')
    const done = sayASlotHasNothingToReport(id, body.at, workspaceOf(req), actorFrom(req))
    return {
      agent: done.agent,
      at: done.at,
      message: done.message,
      already: done.already,
      says: done.already
        ? `Somebody had already said the ${done.at} report has nothing in it. Nothing more was written.`
        : `The ${done.at} report has nothing in it. The office sends no reminder for it, and it does not count toward the pause.`,
    }
  })

  app.post(
    '/agents/started',
    route(
      'agent.register-started',
      'remote',
      'Register an agent you have just started, in one request. Body ' +
        '{"handle":…,"name":…,"role"?:…,"runtime"?:…,"workArea"?:[…],"notes"?:…,"language"?:…}. `language` is the ' +
        'language the agent reads, and its card\'s handbook is sent in it; left out, the handbook is sent in every ' +
        'language it is written in. LEAVING `role` OUT REGISTERS A ' +
        'WORKER, criterion P65: the row holds no card, every refusal reads such a row as the worker card, and the ' +
        'reply says so rather than a screen drawing a word nobody chose. The agent asks you for a higher rung with ' +
        'POST /api/roles/requests and you answer with one press. WHO STARTED IT IS THE CALLER, ' +
        'read from the actor headers and never from the body: naming somebody else as the starter would name ' +
        'somebody who has not agreed to answer for it. The caller must itself be registered, because a starter ' +
        'nothing holds is a chain that ends nowhere. A starter may not give a role above its own, and only the ' +
        'person appoints a secretary or an inspector. `workArea` is the folders and files this agent is there to ' +
        'change, recorded so that whoever checks the work can find the changes; nothing is refused for leaving it ' +
        'out and no write outside it is refused. `startedFor` is the record whose end ends this role — when the ' +
        'claim on it is released, this agent is retired with the reason, and its handle is free for a new agent. The reply ' +
        'names the three things to hand the started agent: its ' +
        'handle, the run that started it, and the address of this API. It writes the same `agent` record ' +
        'POST /api/records writes, so the registry row, the inbox and the conversation are the ordinary ones. ' +
        'A HANDLE A LIVE AGENT ALREADY BEARS, sent from another project, joins that agent\'s row and changes ' +
        'nothing on it: `joinedAnExistingRow` is true, the reply names the starter, the card and the run the row ' +
        'already holds and says this registration did not change them, no card message is sent and no key is answered. ' +
        '`noKey: true` REGISTERS AN AGENT WITH NO KEY OF ITS OWN: no key is made, and a write in its name is then taken ' +
        'only with a run key or the office\'s key. A supervisor registers its worker so through its own run key, and then ' +
        'asks for the worker\'s runs at POST /api/agents/<worker>/worker-run. Refused with it: a caller not proved by its ' +
        'own key (the person\'s key, or the caller\'s own agent key, a run key included), and a handle a live agent ' +
        'already bears.',
    ),
    async (req, reply) => {
      const actor = actorFrom(req)
      const starter = participantForActor(actor)
      const body = parse(aStartedAgent, req.body, 'The request body is not usable:')
      // THE WORK AREA IS NOT CHECKED HERE. Criterion P92 judges it by the CARD OF THE AGENT BEING
      // REGISTERED, and which card that is is decided below by the role check; checking it before
      // that would be reading the rule before the thing it is a rule about exists.

      // ZERO. IS THIS MACHINE ALLOWED TO REGISTER ANYBODY AT ALL. Criterion P69, on what the owner found on
      // 7 September 2026: an agent on the owner's other machine registered itself here as a worker with no
      // confirmation from the owner. Registration from anywhere but this machine needs a credential the person
      // has confirmed, and the refusal names the door that issues one and where they confirm it. It
      // is asked FIRST, before the chapters line and before the chain, because a caller that may not
      // register anything should not be told what else was wrong with its request.
      const from = whereThisRegistrationCameFrom(req, body.runtime)
      if (from.refusal !== null) throw new PanelError(from.refusal, 403)

      /**
       * ZERO AND A HALF. ONE SESSION ON ANOTHER MACHINE GETS ONE ROW. Criterion P81's collision rule.
       *
       * THE OWNER'S CASE, 8 September 2026: the Codex session on the owner's other machine registered twice, under
       * two handles, and the owner had to work out which of the two rows was which. A credential is issued
       * to ONE agent — this API says so where it issues one — so a second registration under the
       * same credential is one session asking twice, not a second agent arriving.
       *
       * IT ANSWERS WITH THE ROW AND WRITES NOTHING, rather than refusing. A refusal would leave a
       * caller that has simply asked twice with no row it can use and no way forward; the honest
       * answer to "register me" from something already registered is the registration it has.
       *
       * IT IS ASKED BEFORE THE CHAPTERS LINE AND THE CHAIN, because none of those questions is about
       * this request: nothing is being written, so nothing about the body has to be usable.
       */
      if (from.credential !== null) {
        const already = theRowThisCredentialAlreadyHas(from.credential.id)
        if (already !== null) {
          void reply.code(200)
          return {
            record: recordForAgentIn(already.id, workspaceOf(req)),
            agent: already,
            startedBy: already.startedBy,
            alreadyRegistered: true,
            says:
              `This credential already has a row here: "${already.handle}". Nothing was written and no second row ` +
              'was made. A credential is issued to one agent, so a second registration under it is this session ' +
              `asking twice rather than a second agent arriving — which is what happened on 8 September 2026, when ` +
              'one session on another machine ended up with two rows under two handles. Write under ' +
              `"${already.handle}". If this really is a second agent, ask for a credential of its own at ` +
              'POST /api/office/visitors and have the owner confirm it.',
          }
        }
      }

      // THE CHAPTERS LINE, READ BEFORE ANYTHING IS WRITTEN. Criterion C14. A word that names no
      // chapter is refused with the word in it rather than dropped, because a starter that thinks
      // it pointed its agent at chapter 5 and did not is the failure this line exists to stop.
      const chaptersRead = body.chapters === undefined ? null : readTheChaptersNamed(body.chapters)
      if (chaptersRead !== null && chaptersRead.problems.length > 0) {
        throw new PanelError(
          `The chapters line could not be read: ${chaptersRead.problems
            .map((one) => `"${one.said}" — ${one.because}`)
            .join(' ')} This office's chapters are at GET /api/office-regulations, and each entry is a number or a name, ` +
            'with a reading level after a colon where it is not digest. Nothing was written.',
          400,
        )
      }
      const chaptersNamed = chaptersRead === null ? null : chaptersRead.named

      // ONE. THE STARTER IS SOMEBODY THE REGISTRIES HOLD. A message meets the same rule:
      // `whyAnUnregisteredWriterIsRefused` in src/server/lib/messages.ts refuses a writer that no
      // registry holds. Since a later decision it does so for a message to an agent as well
      // as to a person. Criterion M59 first built it for a person only.
      // The reason is the same here: a chain that ends at a name nothing holds cannot be followed up,
      // and the whole point of recording a starter is that somebody answers for the agent. Both
      // refusals say to register first. This one names two ways: the caller registers itself, or the
      // agent that started the caller registers this agent.
      if (starter === null) {
        throw new PanelError(
          `Nothing is registered as "${actor.id}", so it cannot register an agent under itself. Whoever starts an ` +
            'agent answers for it, and a starter no registry holds is a chain that ends nowhere. There are two ways ' +
            'on. Register yourself first: file a record of kind `agent` with a handle, and send that handle as your ' +
            'actor id. Or ask the agent that started you to register this one, which is the path the person\'s rule names — ' +
            '谁启动的谁负责管理与对接. GET /api/participants lists every person and every durable agent. Nothing ' +
            'was written.',
          403,
        )
      }

      // TWO. THE CHAIN OF STARTERS ABOVE THIS ONE REACHES THE PERSON. Criterion P9, and it is what
      // refuses a loop as well: two agents that started each other reach nobody, and so does an
      // agent whose own starter nobody recorded. A chain that reaches nobody is a chain where
      // nobody answers for what is at the bottom of it, which is the whole point of recording one.
      // The refusal says where the chain stopped and what it would have joined.
      // IT READS ONLY THE ROWS EACH STRING ON THE CHAIN NAMES (`theStarterEachStringNames`), by the rule the stored
      // reader of every agent follows, so it reads the agents on the chain and not every agent.
      const theAgentThisNames = theStarterEachStringNames()
      const above = theChainUpWith({ kind: starter.kind, id: starter.id }, theAgentThisNames)
      if (!above.reachesThePerson) {
        // EACH AGENT RUNG IS NAMED BY THE HANDLE ON ITS ROW. The chain holds registry ids, and a minted
        // id is not a name a person knows. A rung no row answers is shown as it was stored: the reader
        // answered it with nobody on the walk, and answers it the same way here.
        const named = (one: ParticipantRef): string =>
          one.kind === 'agent' ? (theAgentThisNames(one.id)?.handle ?? one.id) : one.id
        throw new PanelError(
          `${above.says} This registration would have joined that chain, so it is refused: an agent at the ` +
            'bottom of a chain that reaches nobody has nobody answering for it, which is what a starter is for. ' +
            `What it would have joined: ${above.chain.map((one) => `${participantWord(one.kind)} "${named(one)}"`).join(' -> ')}. ` +
            'A person can set the starter of whichever agent the chain stopped at, which mends every chain ' +
            'through it. Nothing was written.',
          403,
        )
      }

      // THREE. THE ROLE IS ONE THIS STARTER MAY GIVE. Criterion P58: only the person appoints a secretary,
      // a supervisor may appoint a supervisor, and a worker may not appoint a supervisor. Three rules, and
      // `whyThisRoleMayNotBeGiven` says which one refused:
      // a card whose `appointedBy` is the person is the person's to give and no agent may give it
      // (the secretary, and the inspector, because an inspector appointed by the agent whose work it
      // checks is not a check); a card whose `appoints` is nobody gives no role at all (the worker,
      // and the inspector); otherwise a starter gives a role AT OR BELOW its own rung, so a
      // supervisor may now make a supervisor. All three are read off the cards, so changing who may
      // appoint whom is an edit to design/permissions/roles.json and no code change.
      // A CARD NOBODY NAMED IS NOT CHECKED, BECAUSE THERE IS NOTHING TO CHECK. Criterion P65: the
      // row is written with no card, every refusal reads it as the worker card, and no starter of
      // any rung is refused for giving nothing away.
      const cards = theRoleCards()
      if (body.role !== undefined) {
        if (starter.kind !== 'person') {
          // The starter was resolved by `participantForActor` above, so its `.id` is a registry id.
          const heldByStarter = (readParticipant(starter) as RegisteredAgent | null)?.role ?? null
          const no = whyThisRoleMayNotBeGiven(cards, heldByStarter ?? A_ROW_WITH_NO_ROLE_READS_AS, body.role)
          if (no !== null) throw new PanelError(`${no} Nothing was written.`, 403)
        } else if (!isARole(cards, body.role)) {
          throw new PanelError(
            `"${body.role}" is not a role here. The roles are ${theRoleWordsSaid(cards)}. Nothing was written.`,
            400,
          )
        }
      }

      /**
       * THREE AND A HALF. THE WORK AREA IS THE NEW AGENT'S CARD'S OWN GRAIN. Criterion P92.
       *
       * IT IS ASKED AFTER THE CARD IS DECIDED and never before: the rule is the card's, and which
       * card this agent holds is what the block above works out. A card with no `workArea` block is
       * refused here rather than waved through, because the door would have no rule to apply.
       */
      if (body.workArea !== undefined) {
        const heldCard = cardFor(cards, body.role ?? A_ROW_WITH_NO_ROLE_READS_AS)
        body.workArea = validateWorkArea(body.workArea, heldCard)
      }

      /**
       * THREE AND THREE QUARTERS. AN AGENT WITH NO KEY OF ITS OWN IS REGISTERED ONLY THROUGH THE CALLER'S OWN KEY, AND
       * ONLY AS A NEW ROW.
       *
       * THE CALLER'S OWN KEY: the person's key, or an agent key that proved the very agent the headers named, which a
       * run key does. A claim with no key proves nobody. The office's key under an agent's name, and a supervisor's run
       * key acting for another agent's run, prove that the caller is not the starter named, so neither may answer for
       * an agent that will hold no key of its own.
       *
       * A NEW ROW: sent from another project, a handle a live agent already bears joins that agent's row
       * (`keepTheAgentRegistryInStep`), and the mark would then change how an agent already at work signs. In the same
       * project the handle is refused further on as well; this refusal comes first so the caller is told what the
       * registration needs. `agentByHandle` reads the registry of every project.
       */
      const noKey = body.noKey === true
      if (noKey) {
        const ownKey =
          actor.provedBy === 'the-person-key' ||
          (actor.provedBy === 'an-agent-key' && actor.provedHolder === undefined && actor.keyHolder !== undefined)
        if (!ownKey) {
          const carried =
            actor.provedBy === undefined
              ? 'carried no key the office holds'
              : actor.provedBy === 'the-office-key'
                ? "carried the office's key, which is not the caller's own"
                : "carried a run key acting for another agent's run"
          throw new PanelError(
            `An agent with no key of its own is registered only through the caller's own key: the person's key, or the ` +
              `caller's own agent key, a run key included. This request ${carried}. Nothing was written.`,
            403,
          )
        }
        const bearer = agentByHandle(body.handle.trim())
        if (bearer !== null) {
          throw new PanelError(
            `A live agent already bears the handle "${bearer.handle}", and an agent already registered cannot be changed ` +
              'to have no key of its own. Register the new agent under another handle. Nothing was written.',
            409,
          )
        }
      }

      // FOUR. THE ORDINARY WRITE. The same record POST /api/records files, so the registry row, the
      // inbox and the conversation are the ones every other agent has, and every check on that path
      // — the handle being free, the notes path, the role word — runs here too.
      // THROUGH THE DOOR, so a registration may write the card its starter named. Problem
      // mz5ddKDITE3j: the ordinary record write path refuses a card on an agent record to
      // everybody but the person. A starter naming one is the other honest way it is written, and
      // who may name which card is decided above by `whyThisRoleMayNotBeGiven`.
      // IN ONE TRANSACTION WITH THE MARK of an agent with no key of its own, so neither is stored without the other.
      const { made: created, joinedARow } = sqlite.transaction(() => {
        // THE LAST ROW OF THE REGISTRY BEFORE THIS WRITE, as one number. The comment on `joined` below says why.
        const theLastRowBefore = (sqlite.prepare('SELECT max(rowid) AS last FROM agents').get() as { last: number | null }).last ?? 0
        const made = throughTheCardDoor(() =>
          createRecordWithReport({
            workspaceId: workspaceOf(req),
            kind: 'agent',
            title: body.name,
            data: {
              handle: body.handle,
              state: 'active',
              ...(body.runtime === undefined ? {} : { runtime: body.runtime }),
              ...(body.notes === undefined ? {} : { notes: body.notes }),
              ...(body.workArea === undefined ? {} : { workArea: body.workArea }),
              ...(body.startedFor === undefined ? {} : { startedFor: body.startedFor }),
              ...(body.language === undefined ? {} : { language: body.language }),
              // THE CHAPTERS LINE, as it was read. Criterion C14. Left out when the starter named none,
              // which is not an exemption: `theChaptersLineFor` then answers with the card's own Must
              // read line and says "no chapters named", so the emptiness is visible rather than absent.
              ...(chaptersNamed === null ? {} : { mustRead: chaptersNamed }),
              startedBy: { kind: starter.kind, id: starter.id },
              // AND THE CREDENTIAL IT CAME IN ON, where it came from another machine. Criterion P69.
              // Measured from the socket, never sent: a caller that could name its own credential
              // could name one the owner confirmed for somebody else.
              ...(from.credential === null ? {} : { credential: from.credential.id }),
              // THE CARD, ALWAYS WRITTEN, AND A MARK SAYING WHO CHOSE IT. Criterion P75: the worker card is
              // the default. A registration that names no card used to
              // write nothing here, and every reader then worked the word `worker` out again from the
              // absence — which made "which card" and "did anybody choose it" two facts read out of
              // one empty value. Now the card is written and the mark says whether the rule wrote it
              // or a starter chose it, so no screen has to read a choice out of an absence.
              role: body.role ?? A_ROW_WITH_NO_ROLE_READS_AS,
              // `who` IS LEFT OUT WHERE THE RULE CHOSE IT, not sent as null. The validator refuses a
              // nested object written as null — half of a shape where a whole one was needed — and
              // absent is the honest spelling anyway: nobody chose it, so there is nobody to name.
              cardChosenBy:
                body.role === undefined
                  ? { how: 'the-rule' }
                  : { how: 'a-starter', who: { kind: starter.kind, id: starter.id } },
              // THE RUN DOING THE REGISTERING IS THE RUN THAT STARTED IT, said by that run at the only
              // moment anybody knows it. Criterion P11. Left out when the caller sent no session, and
              // the reply already says that nothing then knows which run started it.
              ...(actor.sessionId === undefined || actor.sessionId === null || actor.sessionId === ''
                ? {}
                : { startedByRun: actor.sessionId }),
            },
            actor,
          }),
        )
        // A JOINED ROW IS ONE THAT WAS IN THE REGISTRY BEFORE THIS WRITE. SQLite gives a row it inserts the
        // rowid one past the largest in the table (until the largest is 2^63 - 1), the registry names no
        // rowid of its own and no line deletes an agent row, so a row this write made comes after
        // `theLastRowBefore` and a row that was there already does not. Both are read inside this
        // transaction, so no other write comes between them. Until wave 13u round 43 this door read every
        // agent before the write and looked for the row's id among them, which gives the same answer.
        const row = agentForRecord(made.record.id)
        const rowAt = row === null ? null : (sqlite.prepare('SELECT rowid AS at FROM agents WHERE id = ?').get(row.id) as { at: number }).at
        const joined = rowAt !== null && rowAt <= theLastRowBefore
        if (noKey) {
          if (row === null || joined) {
            throw new PanelError(
              `The registration of "${body.handle}" made no new registry row, so it was not marked as having no key of ` +
                'its own, and the registration was rolled back.',
              500,
            )
          }
          markAsSigningOnlyWithRunKeys(row.id)
        }
        return { made, joinedARow: joined }
      })()

      /**
       * AND THE ONE MESSAGE THE NEW AGENT GETS ABOUT THE CARD IT NOW HOLDS. By a decision,
       * a registration writes one. It goes to the agent, in this project, from the
       * office, as an ordinary unseen message — the waiter hands it over, or the agent reads it at
       * its next start. The card message builder reads the card out of the declaration, so nothing
       * here restates the card's words.
       */
      // THE CARD MESSAGE IS ADDRESSED TO THE NEW ROW, NOT TO THE NAME IT WAS REGISTERED UNDER.
      // `body.handle` is a name; the row's registry id stops being that name once the mint lands,
      // and a message addressed to the name would reach another agent or nobody.
      const newRow = agentForRecord(created.record.id)
      if (newRow === null) {
        throw new PanelError(
          'The registration wrote its record but no registry row answered for it, so its card message was not sent.',
          500,
        )
      }
      // `joinedARow` WAS WORKED OUT INSIDE THE WRITE'S TRANSACTION, above: true where `newRow` was in the
      // registry before this write, so no new agent was made.
      // A JOINED ROW GETS NO CARD MESSAGE. Keys wave, round 6. Joining a row does not change its card
      // (`keepTheAgentRegistryInStep` maps the new record onto the row and writes nothing on it), so a
      // message about "the card it now holds" would tell an agent already at work about a card it was
      // not given. The reply's `card.says` says no card message was sent.
      if (!joinedARow) {
        writeTheCardMessageToOne({
          to: { kind: 'agent', id: newRow.id },
          workspaceId: workspaceOf(req),
          role: body.role ?? A_ROW_WITH_NO_ROLE_READS_AS,
          actor,
        })
      }

      /**
       * THE KEY THIS REGISTRATION ANSWERS, ONCE. Criterion P83, point 5.
       *
       * IT IS MADE HERE, AFTER THE ROW EXISTS, so a registration that was refused writes no key. The
       * value is 32 random bytes from `makeAnAgentKey`, which stores only its SHA-256 in `held_keys`,
       * and it is put in `whatToGiveIt` below — the place that already says what to hand the started
       * agent. This is the only reply that carries it, and the sentence beside it says so.
       *
       * A registration in a second project under a live agent's handle is joined to that agent's row,
       * and is answered no key at all (the comment on `joinedARow` below says why). A registration
       * under a retired agent's handle is a new row with a new id (criterion I3), which has held no
       * key, so it is given one. `aKeyWasEverHeldBy`, which asks whether any key was ever held,
       * revoked or not, is still asked of a new row, so a key is never minted twice for one row.
       */
      // THE KEY IS HELD BY THE ROW JUST WRITTEN, so it is asked about by that row's registry id. Asked by
      // the handle, it would send the handle back through the resolver, which refuses a handle that is
      // also another agent's id, after the row was already written.
      //
      // A JOINED ROW IS ANSWERED NO KEY, WHETHER OR NOT IT EVER HELD ONE. Keys wave, round 5. The caller
      // of this door proves that it is some registered agent. It does not prove that it started the
      // agent whose handle it sent. So an agent that already had a row gets its key only through its
      // own ask at POST /api/agents/register-myself, which is what round 4 made of that door's first
      // key: the new-key ask, answered by the person or its starter, and collected with a one-time
      // secret. Measured on the copy of 25 September 22:17: no agent had records in two projects, so
      // no registration by any door had ever joined a row this way.
      //
      // AN AGENT REGISTERED WITH NO KEY OF ITS OWN IS ANSWERED NO KEY. Its runs are given run keys instead.
      const agentKey = joinedARow || noKey
        ? null
        : aKeyWasEverHeldBy('agent', newRow.id) ? null : makeAnAgentKey(newRow.id, howThisCallProvesTheKeyItMakes(actor))

      // AND ANY OTHER AGENT ALREADY AT WORK WHOSE AREA THIS ONE OVERLAPS GETS A GROUP WITH IT.
      // Criterion P95. Nothing is refused by the overlap: the registration above stands, and this
      // only opens the place where the two agents and their supervisors settle it.
      if (body.workArea !== undefined && body.workArea.length > 0) {
        // BY THE NEW ROW'S ID, for the reason the work-area door gives: a handle a retired agent and
        // this new one share would name nobody there (criterion I3).
        openTheGroupsForAWorkArea(
          { agentHandle: newRow.id, area: body.workArea, workspaceId: workspaceOf(req) },
          actor,
        )
      }

      // AND THE SECRETARIAT GROUP FOLLOWS THE CARD IT JUST WROTE. A registration that named the
      // secretary card puts the new secretary in the one standing group at once, and a registration
      // that did not leaves the group as it is.
      syncTheSecretariatGroup()
      // AND THE BROADCAST SCHEDULE FOLLOWS THE SAME CARD.
      syncTheBroadcastSchedules()

      // THE ROW JUST WRITTEN, read again by its id so the reply carries what the syncs above left on it.
      const row = readParticipant({ kind: 'agent', id: newRow.id }) as RegisteredAgent | null
      // WHAT A JOINED ROW HOLDS, read from the row itself. Keys wave, round 6: the reply for a joined
      // row used to name the caller as the starter and say the rule wrote the worker card, while the
      // row kept its own starter and its own card. A new agent's reply is built as before, below.
      let joined: WhatAJoinedRowHolds | null = null
      if (joinedARow) {
        if (row === null) {
          throw new PanelError(
            `The registration was joined to the row of "${body.handle}", and that row could not be read back, so ` +
              'nothing here can say who started it or which card it holds.',
            500,
          )
        }
        joined = whatAJoinedRowHolds(row, body.role)
      }
      void reply.code(201)
      return {
        record: created.record.id,
        agent: row,
        // WHETHER THIS REGISTRATION JOINED THE ROW OF A LIVE AGENT THAT ALREADY HAD ONE, rather than
        // making a new agent. True answers no key; `whatToGiveIt.keySays` says why and what instead.
        joinedAnExistingRow: joinedARow,
        // WHO STARTED IT: the caller, for a new agent. For a joined row, the starter the row already had,
        // which this registration did not change, with the sentence that says so.
        ...(joined === null
          ? { startedBy: { kind: starter.kind, id: starter.id } }
          : { startedBy: joined.startedBy, startedBySays: joined.startedBySays }),
        // WHAT TO GIVE THE STARTED AGENT. Three things, and the middle one is the one nothing hands
        // over today: the run that started it. It is the actor's own session, which is the run
        // making this request, and it is null when the caller sent no session header — said rather
        // than invented, because a parent nobody recorded is not the same as no parent.
        // WHAT THE STARTER NAMED AND WHAT APPLIES. Criteria C14 and C15: the reply says which
        // chapters were named, which apply, and — where none were named — says so in a sentence
        // rather than leaving an absent field that reads as nothing at all.
        // FOR THE CARD IT HOLDS: the card this registration wrote for a new agent, the row's own for a joined one.
        chapters: theChaptersLineFor({
          named: chaptersNamed,
          role: joined === null ? (body.role ?? A_ROW_WITH_NO_ROLE_READS_AS) : joined.cardReadAs,
        }),
        // WHICH CARD IT HOLDS, AND WHO CHOSE IT. Criteria P65 and P75: a starter that named none is
        // told which card was written and that the rule wrote it, rather than being left to find
        // out that its agent is a worker by being refused something.
        //
        // `role` IS NEVER NULL HERE ANY MORE. The row carries a card whatever the starter said, so
        // there is nothing left for a caller to read as worker: `chosenBy` is the fact that used to
        // be inferred from the null.
        card: joined !== null ? joined.card : {
          role: body.role ?? A_ROW_WITH_NO_ROLE_READS_AS,
          chosenBy:
            body.role === undefined
              ? { how: 'the-rule', who: null }
              : { how: 'a-starter', who: { kind: starter.kind, id: starter.id } },
          says:
            body.role === undefined
              ? `Nobody named a card, so the rule wrote the ${A_ROW_WITH_NO_ROLE_READS_AS} card and the row says ` +
                'the rule chose it rather than a starter. This agent asks you for a higher one with ' +
                'POST /api/roles/requests, and you answer with one press.'
              : null,
        },
        // WHICH CREDENTIAL THIS REGISTRATION CAME IN ON, or null because it was made on this
        // machine and needed none. Criterion P69.
        credential: from.credential === null ? null : from.credential.id,
        whatToGiveIt: {
          handle: body.handle,
          // THE RUN THAT STARTED IT: this request's own run for a new agent, the row's own for a joined one.
          ...(joined === null
            ? {
                startedByRun: actor.sessionId ?? null,
                startedByRunSays:
                  actor.sessionId === undefined || actor.sessionId === null
                    ? 'This request carried no session, so nothing knows which run started it. Send x-mole-office-session.'
                    : null,
              }
            : { startedByRun: joined.startedByRun, startedByRunSays: joined.startedByRunSays }),
          api: settings().apiAddress,
          // THE KEY, AND THE SENTENCE SAYING THIS IS THE ONLY TIME IT IS SHOWN. Criterion P83,
          // point 5. Where the registration joined a live agent's row, no key and the sentence saying
          // how that agent asks for its own. Where a new row somehow already held a key, neither.
          ...(agentKey !== null
            ? { key: agentKey, keySays: THE_AGENT_KEY_IS_SHOWN_ONCE }
            : noKey
              ? { keySays: whatARegistrationWithNoKeyIsAnswered(body.handle, starter) }
              : joinedARow
                ? { keySays: whatAJoinedRowIsAnsweredInsteadOfAKey(body.handle) }
                : {}),
        },
        incomplete: created.incomplete,
      }
    },
  )

  /**
   * A SESSION A PERSON STARTED REGISTERS ITSELF. F15 point 2; problem pHFu8nivPZ_O.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT IT REPLACES
   * ---------------------------------------------------------------------------------------
   *
   * On 14 September 2026 a new session in another project's folder took about twenty tool calls and met two
   * refusals to become a registered agent: `POST /api/agents/started` refused it because nothing was
   * registered as it (a starter it did not have), and `POST /api/roles/requests` refused it because
   * its starter was a person. Both refusals sent it to file records by hand. This is one request in
   * their place: the agent record, the card, the work area, the session, the key, and the headers to
   * send on every later request.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT IT CAN ESTABLISH, AND WHAT IT CANNOT
   * ---------------------------------------------------------------------------------------
   *
   * It CAN establish that the request arrived on the office's own listener, because the route is
   * `local` and the hook refuses it from any other machine; and it can RECORD facts rather than trust
   * them — the working directory, the process, the transcript path. It CANNOT establish that a person
   * started the session: chapter 8 rule 3 says Mole Office cannot tell the person from a program on
   * this machine that sends the person's name. So nothing here claims it. A program that knocked gets an agent
   * row, a key for that handle, a session record and a place in a pipeline. It does not get a card
   * above worker, any act of the person, or a decision.
   */
  app.post(
    '/agents/register-myself',
    route(
      'agent.register-myself',
      'local',
      { act: 'Registering a session as a durable agent', because: 'acts-on-this-machine' },
      SELF_REGISTRATION_NOTE,
    ),
    async (req, reply) => {
      const actor = actorFrom(req)
      const body = parse(selfRegistrationBody, req.body ?? {}, 'The registration')

      // WHICH PROJECT. The header when it named one, otherwise the working directory matched against
      // the registered repositories and work areas. NEVER `default`: the whole point of this section.
      //
      // THE MATCHING IS `resolveProject`, AND IT IS THE ONE COPY. Both halves of this wave needed it.
      // The onboarding read's worker wrote it and this door calls it, so the door and the read cannot
      // disagree about which project a directory is in (invariant 9). It answers five ways, and this
      // door refuses on two of them: nothing matched, and more than one project matched equally well.
      // A registration filed into a guess is the fault this section exists against, and an ambiguous
      // answer is a guess.
      const claim = workspaceFrom(req)
      const resolved = resolveProject(claim, body.workingDirectory)
      if (resolved.id === null) {
        throw new PanelError(
          `${resolved.because} Name the project with ${WORKSPACE_HEADER} and register again. This door does not ` +
            'fall back to the default project, because that is how an agent came to be registered in a project ' +
            'that holds nothing. Nothing was written.',
          400,
        )
      }
      const workspaceId = resolved.id

      const said: WhatASessionSaysAboutItself = {
        handle: body.handle.trim(),
        name: body.name.trim(),
        runtime: body.runtime === undefined || body.runtime.trim() === '' ? null : body.runtime.trim(),
        workingDirectory: body.workingDirectory.trim(),
        workArea: body.workArea ?? null,
        requestedRole: body.requestedRole === undefined || body.requestedRole.trim() === '' ? null : body.requestedRole.trim(),
        providerSession: body.providerSession === undefined || body.providerSession.trim() === '' ? null : body.providerSession.trim(),
        doing: body.doing === undefined || body.doing.trim() === '' ? null : body.doing.trim(),
        machine: body.machine === undefined || body.machine.trim() === '' ? null : body.machine.trim(),
        // THE FOLDER THIS AGENT'S SESSIONS START IN, CHECKED AND NORMALISED HERE, before anything is
        // written, by part (c) of a decision. It is checked at
        // this door rather than at the write
        // so that a folder the office will not store is refused now — including on the path where the
        // window is closed and the registration would otherwise wait for the person's press before
        // anybody found out. `theStartFolderAsItIsStored` is the one rule; the record's own check
        // refuses any other spelling that reaches it by some other route.
        startFolder: theStartFolderThisRegistrationNames(body.startFolder),
        // THE FOLDER WHERE IT KEEPS ITS OWN NOTES, or null because it named none. A blank string is read
        // as nobody asking, as the other optional fields are.
        notes: body.notes === undefined || body.notes.trim() === '' ? null : body.notes.trim(),
      }
      // AND THE NOTES FOLDER IS ABSOLUTE, CHECKED HERE BEFORE ANYTHING IS WRITTEN. `checkAgentNotes` in
      // src/server/lib/records/decision-core.ts is the one rule and its words; the agent record's own write asks it
      // too. It is asked here as well because a registration that arrives while the window is closed
      // is written as a waiting row, and a relative path would otherwise be found only at the person's press.
      checkAgentNotes({ notes: said.notes })
      // AND THE HANDLE KEEPS THE HANDLE RULE, CHECKED HERE BEFORE ANYTHING IS WRITTEN, for the same reason:
      // a waiting row filed under a handle the agent record refuses would be refused only at the person's press.
      // The rule and its words are `whyThatIsNotAHandle` in src/shared/participants.ts, which the agent
      // record's own write asks too.
      const notAHandle = whyThatIsNotAHandle(said.handle)
      if (notAHandle !== null) throw new PanelError(notAHandle, 400)

      // THE SAME HANDLE ASKED TWICE ANSWERS THE REGISTRATION IT HAS. This is `/agents/started`'s own
      // rule and its reason: a refusal would leave a caller that has simply asked twice with no row
      // it can use and no way forward, and the honest answer to "register me" from something already
      // registered is the registration it has. Reused here rather than written a second time. It asks
      // for the LIVE agent bearing the handle: a handle only retired agents bear is free again, and
      // this ask registers a new agent under it (criterion I3).
      const existing = agentByHandle(said.handle)
      // THE ONE-TIME SECRET THIS ASK SENDS BACK, or null because it sent none. A new-key ask and the
      // first ask of an admitted registration are each answered one, and only the ask holding it
      // collects the key.
      const askSecret = body.askSecret === undefined || body.askSecret.trim() === '' ? null : body.askSecret.trim()
      // AN AGENT THAT LOST ITS KEY ASKS FOR A NEW ONE. It follows problem x8ktQfHS5yGr and a decision.
      // Only for a handle a live agent bears: a new handle has no key to replace.
      if (body.newKey === true) {
        if (existing === null) {
          throw new PanelError(
            `No live agent is registered as "${said.handle}", so there is no key to replace. Register it without ` +
              '"newKey". Nothing was written.',
            404,
          )
        }
        return theAnswerToANewKeyAsk(existing, workspaceId, actor, said, askSecret, whereThisAskCameFrom(req, actor), reply)
      }
      if (existing !== null) {
        // THE KEY IS ANSWERED ONLY WHERE NONE WAS EVER ANSWERED, AND ONLY TO AN ASK THAT PROVES IT MAY
        // HAVE IT. Finding 83, mend a2. A registration admitted at once was handed its key
        // already, and this answers no key because the office keeps only its SHA-256. A registration
        // the person admitted is answered its key once, and only to the ask holding the one-time secret
        // its first ask was answered with. An old row that never held a key is answered its key while
        // the key window is open, as before; after the close it gets its first key only through the
        // new-key ask. `collectAFirstKey` in src/server/lib/newkey.ts decides all three, and refuses an
        // ask without the secret before anything is written.
        const first = aKeyWasEverHeldBy('agent', existing.id)
          ? null
          : collectAFirstKey({ agent: existing, secret: askSecret, windowIsClosed: theKeyWindowIsClosed(), actor })
        const key = first === null || first.outcome === 'ask-for-a-new-key' ? null : first.key
        const session = first !== null && first.outcome === 'the-key' ? first.session : null
        void reply.code(200)
        return {
          alreadyRegistered: true,
          agent: existing,
          record: recordForAgentIn(existing.id, workspaceId),
          // THE SESSION RECORD THE PERSON'S PRESS FILED FOR THIS AGENT, or null because this reply names none.
          session,
          keySays: key === null ? null : THE_AGENT_KEY_IS_SHOWN_ONCE,
          // AND WHAT IS TRUE OF A START FOLDER THIS ASK SENT, said out loud. This branch writes nothing
          // at all, so a caller that passed `--start-folder` is told whether that folder is the one
          // recorded. Null when the ask named none.
          startFolderSays:
            said.startFolder === null
              ? null
              : startFolderSaysToARegisteredHandle(said.handle, said.startFolder, theStartFolderOf(existing.id, workspaceId)),
          headers: theSelfRegistrationHeaders(said.handle, workspaceId, actor.sessionId ?? session, key),
          says:
            `"${said.handle}" is already registered here. ` +
            (key === null ? 'Nothing was written and no second row was made' : 'No second row was made') +
            ': the same handle asking twice is answered with the registration it has, so a session that retried ' +
            'after a timeout does not become two agents. Write under this handle and send the headers in this reply ' +
            'on every later request.' +
            (first !== null && first.outcome === 'the-key'
              ? ` They carry its first key, the one time it is shown, collected with the one-time secret of ${first.requestId}.`
              : first !== null && first.outcome === 'the-key-while-the-window-is-open'
                ? ' They carry its first key, the one time it is shown: it never held one, and the key window is open.'
                : '') +
            (first !== null && first.outcome === 'ask-for-a-new-key'
              ? ' This agent has never held a key, and the key window is closed, so this door answers it no first ' +
                'key. Its first key comes only through the new-key ask: ask this door again with "newKey": true ' +
                '(the tool\'s --new-key), and the person, or the agent that started it, answers the ask.'
              : key === null
                ? ' If this agent has lost its key, ask this door again with "newKey": true (the tool\'s --new-key).'
                : ''),
        }
      }

      // A WAITING ROW, ASKED TWICE. Before the person presses, a second ask answers the waiting
      // registration it already has rather than filing a second one.
      const waiting = listRecords({ workspaceId, kind: 'role_request' }).find(
        (record) => aWaitingSelfRegistration(record)?.handle === said.handle,
      )
      if (waiting !== undefined) {
        void reply.code(202)
        return {
          waiting: true,
          request: waiting.id,
          headers: theSelfRegistrationHeaders(said.handle, workspaceId, actor.sessionId ?? null, null),
          says:
            `"${said.handle}" is already waiting for the person's press, on ${waiting.id}. Nothing was written and ` +
            'no second row was made, and this ask is answered no secret. The registration is admitted when the person ' +
            `presses. ${howItsKeyIsCollected(waiting)}`,
        }
      }

      // A NEW HANDLE WHOSE REQUEST PROVED NOBODY, OR ANY NEW HANDLE WHILE THE WINDOW IS CLOSED: LAND AS
      // A WAITING ROW. One press admits the agent and grants the card it asked for, so a new agent costs
      // the person one press and not two. Nothing is registered until then.
      //
      // WHAT PROVES A REGISTRATION. The person's key (or a confirmed device of theirs, which the key
      // reading also calls the person's key), or an agent's own key. A header claim proves nothing,
      // even while the window is open, and the office's own key is not a starter's proof. Decision
      // Nc9QRT9R_IvF; problem ZtbZNZ735RYN, where a keyless process in a sandbox made a durable agent
      // and the office recorded the person as its starter.
      const provedBy = actor.provedBy
      const itProvedSomebody = provedBy === 'the-person-key' || provedBy === 'an-agent-key'
      const windowIsClosed = theKeyWindowIsClosed()
      if (windowIsClosed || !itProvedSomebody) {
        const askedFor = said.requestedRole ?? A_ROW_WITH_NO_ROLE_READS_AS
        // THE ONE-TIME SECRET, answered once to this first ask; the row keeps only its SHA-256. After the
        // press, only the ask that sends it back collects the key. Finding 83, mend a2.
        const { secret, hash } = aOneTimeSecret()
        const waitingRow = createRecordWithReport({
          workspaceId,
          kind: 'role_request',
          title: `${said.handle} registers itself`,
          data: {
            asking: askedFor,
            holding: A_ROW_WITH_NO_ROLE_READS_AS,
            asker: { kind: 'agent', id: said.handle },
            answersTo: { kind: 'person', id: THE_PERSON },
            because: said.doing ?? 'this session registered itself',
            extra: {
              ...theWaitingMarker(said, windowIsClosed ? 'the-window-is-closed' : 'nothing-proved-who-asked', hash),
              ...theAskedFromMarker(whereThisAskCameFrom(req, actor)),
            },
          },
          actor,
        })
        void reply.code(202)
        return {
          waiting: true,
          request: waitingRow.record.id,
          role: A_ROW_WITH_NO_ROLE_READS_AS,
          askedFor: said.requestedRole,
          headers: theSelfRegistrationHeaders(said.handle, workspaceId, actor.sessionId ?? null, null),
          // THE ONE-TIME SECRET, answered once, on the ask that filed the waiting row.
          askSecret: secret,
          says:
            (windowIsClosed
              ? 'The one-version window is closed, so a registration with no key cannot be admitted here by itself. '
              : "This request carried neither the person's key nor an agent's own key, so it proved nobody, and a " +
                'new agent is admitted only by the person\'s press. ') +
            `Nothing was registered: a waiting row (${waitingRow.record.id}) is on the person's waiting list, and one ` +
            "press of the person's on it admits this session and gives it the card it asked for. This reply carries " +
            'a one-time secret, once: keep it, because after the press only the ask of this door that sends it back ' +
            'as "askSecret" is answered the key — the one time it is shown.',
        }
      }

      // AN AGENT'S OWN KEY PROVED THIS REGISTRATION: that agent started the new one and answers for it.
      // The person's key leaves the person as the starter, as before.
      // A key's holder is a stored string, read with the stored reader; a key no one agent answers to
      // is refused rather than recorded as the person's start.
      let startedBy: ParticipantRef | undefined
      if (provedBy === 'an-agent-key') {
        const holder = actor.keyHolder === undefined ? null : theOneAgentAStringNames(sqlite, actor.keyHolder)
        if (holder === null) {
          throw new PanelError(
            'The agent key on this request names no one agent here, so nothing can be recorded as the new ' +
              "agent's starter. Nothing was written.",
            409,
          )
        }
        startedBy = { kind: 'agent', id: holder.id }
      }

      // THE WINDOW IS OPEN AND A KEY PROVED THE REQUEST: REGISTER NOW.
      const done = registerTheSessionItself({
        workspaceId,
        actor,
        said,
        grantTheAskedCard: false,
        answerTheKey: true,
        ...(startedBy === undefined ? {} : { startedBy }),
      })
      // AND THE SECRETARIAT GROUP FOLLOWS THE CARD. This branch registers the session itself and
      // grants no card above the worker's, so it adds nobody today; the call is here so that this
      // registration door and `/agents/started` cannot come to two answers about who belongs.
      syncTheSecretariatGroup()
      // AND THE BROADCAST SCHEDULE, for the same reason and at the same door.
      syncTheBroadcastSchedules()
      // THE ROW JUST WRITTEN, read through the record the registration wrote.
      const row = agentForRecord(done.agentRecordId)
      void reply.code(201)
      return {
        agent: row,
        record: done.agentRecordId,
        session: done.sessionRecordId,
        role: done.role,
        card: {
          role: done.role,
          askedFor: done.askedFor,
          request: done.requestId,
          says:
            done.askedFor === null
              ? 'Nobody asked for a card, so this session holds the worker card. It asks for a higher rung at ' +
                'POST /api/roles/requests, and the person answers with one press.'
              : `It asked for the ${done.askedFor} card. An agent cannot give itself a card, so the ask is ` +
                `recorded on ${String(done.requestId)} and waits for the person's press: GET /api/needs-you and ` +
                "this agent's own page draw it. This session holds the worker card until the person presses.",
        },
        keySays: done.keySays,
        // WHAT WAS RECORDED ABOUT THE FOLDER ITS SESSIONS START IN, or null because none was asked for, by
        // part (c) of a decision.
        startFolder: done.startFolder,
        startFolderSays: whatTheStartFolderReplySays(said.handle, done.startFolder, row?.id ?? null),
        headers: theSelfRegistrationHeaders(said.handle, workspaceId, done.sessionRecordId, done.key),
        says:
          'Registered in one request. The headers in this reply are what every later request must send: the ' +
          'workspace, the actor type and id, the session, and — this one time only — the key. Keep the key in ' +
          'this agent’s own notes folder or in the environment of its process, never in .env.',
      }
    },
  )

  /**
   * A STARTER RE-KEYS AN AGENT IT STARTED. Step 4 of src/server/lib/newkey.ts; the new key is handed to
   * the starter once, the way POST /api/agents/started hands a new worker's key to its starter.
   */
  app.post(
    '/participants/agent/:id/new-key',
    route(
      'agent.new-key',
      'local',
      { act: 'Giving a new key to an agent started by the caller', because: 'acts-on-this-machine' },
      NEW_KEY_NOTE,
    ),
    async (req, reply) => {
      const asked = parse(z.object({ id: z.string().min(1) }).strict(), req.params, 'The agent to give a new key')
      const body = parse(z.object({ because: z.string().optional() }).strict(), req.body ?? {}, 'The new key')
      const actor = actorFrom(req)
      // THE ARRIVING `:id` RESOLVES THE ONE WAY, and the row is then read by the id it chose.
      const named = theAgentAnArrivingReferenceNames(asked.id, 'writing')
      const row = named === null ? null : (readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent | null)
      if (row === null) {
        throw new PanelError(`No agent in this installation answers to "${asked.id}". Nothing was written.`, 404)
      }
      const done = aStarterReKeysAnAgent({
        workspaceId: workspaceOf(req),
        agent: row,
        actor,
        because: body.because === undefined || body.because.trim() === '' ? null : body.because.trim(),
      })
      void reply.code(201)
      return {
        agent: row.handle,
        request: done.requestId,
        keysRevoked: done.keysRevoked,
        key: done.key,
        keySays: THE_AGENT_KEY_IS_SHOWN_ONCE,
        says:
          `Every live key "${row.handle}" held is revoked (${String(done.keysRevoked)}), and this reply carries its one ` +
          `new key. The act is written on ${done.requestId}, with this starter as the one who answers for it. Give the ` +
          'key to the agent in its environment or a 0600 file, never on a command line.',
      }
    },
  )

  app.get('/agent-tags', route('participant.read', 'remote', 'Read the asking person’s own agent tags.'), async (req) => ({
    tags: personalAgentTags(participantForActor(actorFrom(req))),
  }))

  app.put('/agent-tags', route('participant.change', 'remote', 'Keep the asking person’s own agent tags.'), async (req) => ({
    tags: keepPersonalAgentTags(participantForActor(actorFrom(req)), (req.body as { tags?: unknown } | null)?.tags),
  }))

  app.get('/participants', route('participant.list', 'remote', LIST_NOTE), async (req) => {
    const asked = parse(listShape, req.query ?? {}, 'The shape asked for')
    let cursor: z.infer<typeof participantCursor> | null = null
    if (asked.cursor !== undefined) {
      try { cursor = participantCursor.parse(JSON.parse(Buffer.from(asked.cursor, 'base64url').toString('utf8'))) }
      catch { throw new PanelError('The participant page cursor is not valid.', 400) }
    }
    const both = listParticipants()
    // THE PROJECT THIS REQUEST IS ABOUT, for the one project-shaped field on this reply: which agent
    // record a registry row is joined to here. Criterion M36; `recordForAgentIn` says why.
    const workspaceId = workspaceOf(req)
    // THE PICTURES ON OFFER, READ ONCE FOR THE WHOLE LIST rather than once per row; see `onTheWire`.
    const avatars = avatarsOnOffer()
    // AND EVERY AGENT'S RECORD IN THIS PROJECT, ALSO ONCE (acceptance finding 26).
    const records = recordsForAgentsIn(workspaceId)
    // Compare against one current office id for this list, not one SELECT per picture. A new
    // request creates a new test, so a re-mint needs no server restart.
    const officeTest = theMoleOfficeTest()
    const newer = theAgentsNewerThanASameNamedOne()
    const resolve = asked.shape === PAGE_SHAPE ? () => null : theAgentAStoredReferenceNamesIn(both.agents)
    const reader = theReaderOfAnOptionalLook(req)
    const rowids = new Map<string, number>()
    for (const table of ['people', 'agents'] as const) {
      for (const row of sqlite.prepare(`SELECT id, rowid AS rowid FROM ${table}`).all() as { id: string; rowid: number }[]) rowids.set(`${table}:${row.id}`, row.rowid)
    }
    const rows = [
      ...both.people.map(held => ({ kind: 'person' as const, held, rowid: rowids.get(`people:${held.id}`)! })),
      ...both.agents.map(held => ({ kind: 'agent' as const, held, rowid: rowids.get(`agents:${held.id}`)! })),
    ]
    const after = (row: typeof rows[number]) => {
      if (cursor === null) return true
      if (row.kind !== cursor.kind) return row.kind === 'agent'
      const compared = Buffer.compare(Buffer.from(row.held.handle), Buffer.from(cursor.handle))
      return compared > 0 || (compared === 0 && row.rowid > cursor.rowid)
    }
    const start = rows.findIndex(after)
    const first = start < 0 ? rows.length : start
    const people: object[] = []
    const agents: object[] = []
    let bytes = 0
    let next: string | null = null
    let says = ''
    const describe = (end: number, more: boolean) => end === first
      ? `No participants remain of ${String(rows.length)}. There is no next page.`
      : `Rows ${String(first + 1)} to ${String(end)} of ${String(rows.length)}.${more ? ' Follow next to read the rest.' : ' There is no next page.'}`
    for (let i = first; i < rows.length; i++) {
      const row = rows[i]!
      const held = row.held as unknown as Record<string, unknown>
      const value = asked.shape === PAGE_SHAPE
        ? pageParticipant(row.kind, held, avatars, records, newer, officeTest)
        : onTheWire(row.kind, held, workspaceId, resolve, avatars, records, newer, officeTest)
      // A PERSON'S OWN LOOK, ON THEIR OWN ROW ONLY WHEN THEY ARE THE READER, in both shapes (lib/the-look.ts).
      if (row.kind === 'person') Object.assign(value, theLookForTheReader({ kind: 'person', id: String(held['id']) }, reader))
      const target = row.kind === 'person' ? people : agents
      const rowBytes = Buffer.byteLength(JSON.stringify(value)) + (target.length === 0 ? 0 : 1)
      const more = i + 1 < rows.length
      const query = new URLSearchParams()
      if (asked.shape === PAGE_SHAPE) query.set('shape', PAGE_SHAPE)
      if (asked.limit !== undefined) query.set('limit', String(asked.limit))
      query.set('cursor', Buffer.from(JSON.stringify({ kind: row.kind, handle: row.held.handle, rowid: row.rowid, id: row.held.id })).toString('base64url'))
      const candidateNext = more ? `/api/participants?${query.toString()}` : null
      const candidateSays = describe(i + 1, more)
      const overhead = Buffer.byteLength(JSON.stringify({ people: [], agents: [], total: rows.length, next: candidateNext, says: candidateSays }))
      if (bytes + rowBytes + overhead > PARTICIPANT_REPLY_BYTES) {
        if (people.length + agents.length === 0) throw new PanelError('One participant is too large for a roster page.', 413)
        break
      }
      target.push(value)
      bytes += rowBytes
      next = candidateNext
      says = candidateSays
      if (asked.limit !== undefined && people.length + agents.length >= asked.limit) break
    }
    if (people.length + agents.length === 0) says = describe(first, false)
    return { people, agents, total: rows.length, next, says }
  })

  app.get('/participants/:kind/:id', route('participant.read', 'remote', READ_NOTE), async (req) => {
    const who = theParticipantThePathNames(parse(whichParticipant, req.params, 'The participant asked for'), 'reading')
    const held = readParticipant(who)
    if (held === null) throw new PanelError(`No ${participantWord(who.kind)} in this installation answers to "${who.id}".`, 404)
    // AND THE LOOK, only when the one asking is this person, as on their roster row (lib/the-look.ts says why).
    return { participant: { ...onTheWireWithTheBroadcast(who.kind, held as unknown as Record<string, unknown>, workspaceOf(req), theStarterEachStringNames(), new Date()), ...theLookForTheReader(who, theReaderOfAnOptionalLook(req)) } }
  })

  // EVERYTHING ONE PROFILE PAGE DRAWS, IN ONE READ. Criterion M51; `theProfile` says why it is one
  // request and not eight.
  app.get('/participants/:kind/:id/profile', route('participant.profile', 'remote', PROFILE_NOTE), async (req) => {
    const who = theParticipantThePathNames(parse(whichParticipant, req.params, 'The participant asked for'), 'reading')
    const held = readParticipant(who)
    if (held === null) throw new PanelError(`No ${participantWord(who.kind)} in this installation answers to "${who.id}".`, 404)
    const workspaceId = workspaceOf(req)
    const reader = participantForActor(actorFrom(req))
    // ONE CLOCK FOR THE WHOLE PAGE, taken here and passed down, so the presence word and the
    // "seen from" times are read from the same moment. Two calls would be two moments.
    const now = new Date()
    return {
      participant: {
        ...onTheWireWithTheBroadcast(who.kind, held as unknown as Record<string, unknown>, workspaceId, theStarterEachStringNames(), now),
        ...(who.kind === 'agent' ? { projects: projectsOfAgent(who.id), personalTags: agentMarksFor(reader).get(who.id) ?? [] } : {}),
      },
      presence: participantPresence(who, workspaceId, now, reader),
      ...theProfile(who, held as unknown as Record<string, unknown>, workspaceId, reader, actorFrom(req), whatTheRoutesSay),
    }
  })

  // ONE AGENT'S OWN CONTEXT, RESTORED BY WHO IT IS. F15 point 4; `theRestore` says why the two ways
  // in do not blend and why the default project is never the answer.
  app.get('/restore', route('participant.restore', 'remote', RESTORE_NOTE), async (req) => theRestore(req, null, whatTheRoutesSay))

  app.get('/restore/:handle', route('participant.restore', 'remote', RESTORE_NOTE), async (req) => {
    const { handle } = parse(z.object({ handle: z.string().min(1) }).strict(), req.params, 'The agent asked for')
    return theRestore(req, handle, whatTheRoutesSay)
  })

  app.patch('/participants/:kind/:id', route('participant.change', 'remote', CHANGE_NOTE), async (req) => {
    const asked = parse(whichParticipant, req.params, 'The participant asked for')
    const body = parse(changeBody, req.body ?? {}, 'The change')
    // THE AGENT IS RESOLVED BEFORE ANY SETTER RUNS, so a refusal here leaves the row as it was. Every
    // setter below, and the rule each asks about who may change what, gets the registry id.
    return sqlite.transaction(() => {
      const who = theParticipantThePathNames(asked, 'writing')
      const by = participantForActor(actorFrom(req))
      // The expected line is checked under the same write lock as every change in this request.
      if (body.stateWas !== undefined && readParticipant(who)?.state !== body.stateWas) {
        throw new PanelError('The line changed. Nothing was written.', 409)
      }
      if (body.name !== undefined) setParticipantName(who, body.name, by, body.nameBecause ?? null)
      if (body.state !== undefined) setParticipantState(who, body.state, by)
      if (body.presence !== undefined) setParticipantPresence(who, body.presence, by)
      if (body.circle !== undefined) setParticipantCircle(who, body.circle, by)
      if (body.circlePicture !== undefined) setParticipantCirclePicture(who, body.circlePicture, by)
      if (body.messageLinkLevel !== undefined) setParticipantMessageLinkLevel(who, body.messageLinkLevel, by)
      if (body.messageLinkLayout !== undefined) setParticipantMessageLinkLayout(who, body.messageLinkLayout, by)
      if (body.messageProjectMark !== undefined) setParticipantMessageProjectMark(who, body.messageProjectMark, by)
      if (body.messagePictures !== undefined) setParticipantMessagePictures(who, body.messagePictures, by)
      if (body.mediaLoad !== undefined) setParticipantMediaLoad(who, body.mediaLoad, by)
      if (body.chatTextSize !== undefined) setParticipantChatTextSize(who, body.chatTextSize, by)
      if (body.chatButtonStays !== undefined) setParticipantChatButtonStays(who, body.chatButtonStays, by)
      if (body.chatOpensAs !== undefined) setParticipantChatOpensAs(who, body.chatOpensAs, by)
      if (body.chatLayout !== undefined) setParticipantChatLayout(who, body.chatLayout.trim() as ChatLayout | '', by)
      if (body.sendKey !== undefined) setParticipantSendKey(who, body.sendKey, by)
      if (body.shortcuts !== undefined) setParticipantShortcuts(who, body.shortcuts, by)
      if (body.chatLabels !== undefined) setParticipantChatLabels(who, body.chatLabels, by)
      if (body.shippedFlags !== undefined) setParticipantShippedFlags(who, body.shippedFlags, by)
      if (body.themes !== undefined) setTheLook(who, body.themes, by)
      if (body.language !== undefined) setParticipantLanguage(who, body.language, by)
      // WHAT IS ON THEIR OWN CARD, criteria P45 and P47. One call for the two, because they are one
      // change to one row and sending either alone must not clear the other.
      if (body.occupation !== undefined || body.portrait !== undefined) {
        setWhatIsOnTheirCard(
          who,
          {
            ...(body.occupation === undefined ? {} : { occupation: body.occupation }),
            ...(body.portrait === undefined ? {} : { portrait: body.portrait }),
          },
          by,
        )
      }
      // WHICH CARD A PERSON HOLDS, criterion P46. Its own rule and its own door, because moving
      // somebody from one card to another is theirs and writing down the card their row is already
      // read as is not a change at all.
      if (body.role !== undefined) setThePersonsCard(who, body.role, by)
      // WHO STARTED THIS AGENT, where nobody was written down. It mends a chain of starters that
      // reaches nobody, which is what stops every agent under it being registered at all.
      if (body.startedBy !== undefined) {
        if (who.kind !== 'agent') {
          throw new PanelError(
            'A person is not started by anybody, so there is no starter to write. Nothing was written.',
            400,
          )
        }
        sayYouStartedThisAgent(who.id, by)
      }
      const held = readParticipant(who)
      if (held === null) throw new PanelError(`No ${participantWord(who.kind)} in this installation answers to "${who.id}".`, 404)
      // AND THE LOOK, only when the one asking is this person (lib/the-look.ts says why).
      return { participant: { ...onTheWireWithTheBroadcast(who.kind, held as unknown as Record<string, unknown>, workspaceOf(req), theStarterEachStringNames(), new Date()), ...theLookForTheReader(who, by) } }
    }).immediate()
  })

  /**
   * SAY HOW YOU WISH TO BE ADDRESSED.
   *
   * ITS OWN DOOR AND NOT A FIELD OF THE PATCH ABOVE, because its rule is different: the PATCH lets a
   * header name the caller, and this door needs the caller proved. A person is proved as themselves
   * and an agent by its own key (`whyThisAddressAsWriteIsRefused` in lib/participants.ts says how).
   * It is not the record write on an agent's record either: a person has no record, the agent record
   * is one per project while the field is the agent's in every project, and the registry row is where
   * its name, picture and line already live.
   *
   * EVERYTHING IS CHECKED BEFORE ANYTHING IS WRITTEN, in this order: the body's shape, which
   * participant the path names, who may set it, each value, and that the row is there. Then one
   * UPDATE writes the four parts together.
   */
  app.put('/participants/:kind/:id/address-as', route('participant.address-as', 'remote', ADDRESS_AS_NOTE), async (req) => {
    const asked = parse(whichParticipant, req.params, 'The participant asked for')
    const body = parse(addressAsBody, req.body ?? {}, 'How this participant wishes to be addressed')
    const who = theParticipantThePathNames(asked, 'writing')
    const actor = actorFrom(req)
    const because = whyThisAddressAsWriteIsRefused(who, actor, true)
    if (because !== null) throw because
    const read = readTheAddressAsSent(body)
    if (!read.ok) throw new PanelError(read.why, 400)
    setParticipantAddressAs(who, read.addressAs, actor)
    const held = readParticipant(who)
    if (held === null) throw new PanelError(`No ${participantWord(who.kind)} in this installation answers to "${who.id}".`, 404)
    return {
      participant: onTheWireWithTheBroadcast(who.kind, held as unknown as Record<string, unknown>, workspaceOf(req), theStarterEachStringNames(), new Date()),
      addressAs: (held as { addressAs: AddressAs }).addressAs,
      says:
        Object.keys(read.addressAs).length === 0
          ? 'Saved. No part is set now, so nothing says how to address this participant.'
          : 'Saved. The parts are stored as written, after trimming.',
    }
  })

  /**
   * WHETHER AN AGENT READS A RELEASE FROM THE CHECK'S OWN RESULT. Wave 13y round 9, answer HeBxwj6QRGjS:
   * an agent that queues a run from the verdict the inspector wrote has read the release already, so a release
   * written to it does not wake it. A refusal always wakes it. The agent says it with its own key, or the owner says
   * it, always with a reason, and it is turned off the same way. Its own door, and not a field of the agent record,
   * because it is the agent's in every project and the record is one project's.
   */
  app.get('/participants/agent/:id/reads-releases-from-the-check', route('participant.read', 'remote', RELEASE_READING_NOTE), async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params, 'The agent')
    const who = theParticipantThePathNames({ kind: 'agent', id }, 'reading')
    return theReleaseReadingAnswer(who.id)
  })

  app.post('/participants/agent/:id/reads-releases-from-the-check', route('participant.release-reading', 'remote', RELEASE_READING_NOTE), async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params, 'The agent')
    const body = parse(z.strictObject({ on: z.boolean(), because: z.string().min(1) }), req.body ?? {}, 'Whether this agent reads a release from the check')
    const who = theParticipantThePathNames({ kind: 'agent', id }, 'writing')
    const actor = actorFrom(req)
    const before = theReleaseReadingOf(who.id)
    const { said: after, byTheGate } = setReadsReleasesFromTheCheck(who, body.on, body.because, actor)
    // A RAISED SECRETARY'S ACT IS WRITTEN DOWN AS DONE UNDER THE RAISE, as a decision
    // asks of every one.
    // An act the gate let through is written down as an ordinary change, in the agent's name.
    ;(byTheGate ? writeDownASettingChange : writeDownAnActUnderTheRaise)(actor, { setting: 'reads-releases-from-the-check', field: `agent ${who.id}`, before, after, workspaceId: workspaceOf(req) })
    return theReleaseReadingAnswer(who.id)
  })

  app.post(
    '/participants/:kind/:id/avatar',
    {
      bodyLimit,
      // FASTIFY'S REFUSAL DOES NOT REACH A CALLER OF THIS ROUTE. Everything else is handed to the
      // one error handler the server installs, so this adds a sentence and changes nothing else.
      errorHandler: (error, request, reply) => {
        if ((error as { code?: unknown }).code === BODY_TOO_LARGE) {
          return reply.status(413).send({ error: pastEvenTheBodyLimit(pictureLimit, bodyLimit) })
        }
        return app.errorHandler(error, request, reply)
      },
      ...route('participant.avatar', 'remote', AVATAR_NOTE),
    },
    async (req, reply) => {
      const asked = parse(whichParticipant, req.params, 'The participant asked for')
      const body = parse(avatarBody, req.body ?? {}, 'The picture')
      // RESOLVED BEFORE THE PICTURE IS STORED, so a refusal writes no file and no row.
      const who = theParticipantThePathNames(asked, 'writing')
      const by = participantForActor(actorFrom(req))
      const uploaded = 'reset' in body ? null : uploadedFrom(body.bytes, who, by)
      const assetId = uploaded === null ? defaultAvatarAssetId(who as ParticipantRef) : uploaded.assetId
      setParticipantAvatar(who, assetId, by)
      const held = readParticipant(who)
      if (held === null) throw new PanelError(`No ${participantWord(who.kind)} in this installation answers to "${who.id}".`, 404)
      reply.code(201)
      return {
        participant: onTheWireWithTheBroadcast(who.kind, held as unknown as Record<string, unknown>, workspaceOf(req), theStarterEachStringNames(), new Date()),
        ...(uploaded === null ? {} : { upload: uploaded.upload, receipt: uploaded.receipt }),
      }
    },
  )

  /**
   * RETIRE AN AGENT'S REGISTRY ROW. Problem zyCcJYCLsAe7.
   *
   * ---------------------------------------------------------------------------------------
   * WHO MAY: THE PERSON, OR THE AGENT'S OWN STARTER
   * ---------------------------------------------------------------------------------------
   *
   * The person, because closing an agent is the person's. And a starter on the agents it started, because
   * whoever started an agent manages it — chapter 7's first rule — and an office that made a worker
   * for an afternoon should be able to close it without asking the person.
   *
   * IT IS THE STARTER AND NOT THE CHAIN ABOVE IT. `startedBy` on the row is the one hop this act
   * follows: a secretary two hops up managing somebody else's worker is a different act, and it has
   * not been asked for.
   *
   * A REASON IS REQUIRED, and that is the whole of the difference between this and a delete. The owner's
   * complaint was that a reader could not tell a closed test agent from a live one; a retirement
   * with no reason recreates exactly that.
   *
   * `local`: closing an agent from another machine is an act about this installation's own registry, and the one caller
   * from elsewhere it takes is the person with their own key over an encrypted door: every write
   * below is in the database, so nothing on this machine's files, ports or processes is touched. An agent from elsewhere,
   * a starter included, is still refused, and a retirement made from there is said on the person's devices.
   */
  app.post(
    '/participants/agent/:id/retire',
    route(
      'agent.retire',
      'local',
      { because: 'reserved-to-the-owner', act: 'Retiring an agent', thePersonMayFromAnotherComputer: true },
      RETIRE_NOTE,
    ),
    async (req) => {
      const asked = parse(z.object({ id: z.string().min(1) }).strict(), req.params, 'The agent to retire')
      const body = parse(retireBody, req.body ?? {}, 'Why it is being retired')
      const actor = actorFrom(req)
      // THE ARRIVING `:id` RESOLVES THE ONE WAY, and this door WRITES, so a retired agent's name is
      // refused here in words. A live id, a live handle, or a retired id are all answered; the row is
      // then read by the exact id the resolver chose.
      const named = theAgentAnArrivingReferenceNames(asked.id, 'writing')
      const row = named === null ? null : (readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent | null)
      if (row === null) {
        throw new PanelError(`No agent in this installation answers to "${asked.id}". Nothing was written.`, 404)
      }
      whyThisIsNotYoursToRetire(row, actor)
      // AT BLOCK, NOT WHILE A CHECK OR A REPORT IS STILL OWED. A decision took option A of
      // `Dbo6FNK86ohz`. … the words are set in src/server/lib/inspection.ts, beside the one
      // reading, so the door has no second opinion about what "still owed" means.
      const owed = whatRetiringWhileACheckIsOwed(row)
      if (owed.length > 0 && gateMet('retire-while-owed') === 'block') {
        throw new PanelError(theRetireSentenceWhileACheckIsOwed(row.handle, owed), 409)
      }
      /**
       * THE WRITES BELOW ARE ONE TRANSACTION: the registry row, the keys, the agent record, the
       * secretariat group and the broadcast schedules. If any of them throws, SQLite undoes all of
       * them, so a refusal leaves the agent live and every key it holds still valid (problem
       * HeqtGKcycLvq). None of them does anything outside the database on this path.
       */
      const done = sqlite.transaction(() => {
        // WHO RETIRED IT IS STORED BY REGISTRY ID. `participantForActor` reads the caller, so an agent
        // that sent its handle and one that sent its id are stored the same way.
        const retired = retireThisAgent(row.id, participantForActor(actor), body.because)
        /**
         * AND THE AGENT'S KEY DIES WITH THE AGENT, IN THE SAME ACT. Criterion P83 point 5, and the
         * lesson of wave 1 driven once already: problem cJHoRBVT6IG8, where ending a credential left
         * the key it bound alive and a phone the person had just ended still wrote decisions. A retirement that
         * leaves the agent's key working is the same failure through the other door.
         *
         * IT IS REVOKED BY THE OWNER THE RETIRE PRESS NAMES, not by a key the press never saw, and the
         * reason names the retirement so a person reading the row knows what ended it. Every live key
         * of this agent goes, not only the newest: this is a statement about the agent, and leaving an
         * older key alive would be the same defect wearing a different hash.
         *
         * REVOKING NOTHING IS NOT A FAILURE. An agent registered before keys existed holds none, and
         * `keysRevoked: 0` says that rather than the door inventing a key to revoke.
         */
        const because = theReasonAsOneSentence(body.because)
        // BY THE ROW'S ID: a handle can be borne by a retired agent and a live one (criterion I3), and
        // only this agent's keys end with it.
        const keysRevoked = revokeEveryLiveKeyHeldBy(
          'agent',
          retired.id,
          `The agent "${retired.handle}" was retired${because === null ? '.' : `: ${because}`}`,
        )
        /**
         * AND THE RECORD SAYS SO TOO, where there is one. Retirement is stored twice — `state` on the
         * agent record and `retired` on the row — and the record is the source everywhere else. A
         * retirement written only to the row would be read back as un-retired the next time anybody
         * patched that record, because `keepTheAgentRegistryInStep` derives the row from the record.
         *
         * THE ROW IS WHAT THE PRESS IS ABOUT and it is written first, so an agent with no record — the
         * case that made this problem — is still retired.
         */
        const record = recordForAgentIn(retired.id, workspaceOf(req))
        let recordWrote = false
        if (record !== null) {
          const written = throughTheRetireDoor(() => patchRecord(
            record,
            // THE STATE IS IN `data` ON AN AGENT RECORD, which is where keepTheAgentRegistryInStep
            // reads it. A dataPatch and never a data: a whole-object write here would empty the
            // handle, the starter and the card, and the door refuses one naming all three.
            { dataPatch: { state: 'retired', retiredBecause: body.because } },
            { type: 'agent', id: 'mole-office/the-api-server', stated: true },
          ))
          recordWrote = written.nothingWritten === undefined
        }
        // AND A RETIRED SECRETARY LEAVES THE SECRETARIAT GROUP. The row is retired by now, so the
        // reconciliation reads it as a non-secretary and ends its membership.
        const secretariat = bringTheSecretariatGroupInStep()
        // AND A RETIRED SECRETARY'S BROADCAST SCHEDULE ENDS.
        const broadcast = bringTheBroadcastSchedulesInStep()
        const { nothingWritten, ...agent } = retired
        return { agent, keysRevoked, noWrites: nothingWritten === true && keysRevoked === 0 && !recordWrote && (secretariat === null || (!secretariat.created && !secretariat.membershipChanged)) && broadcast.added.length === 0 && broadcast.ended.length === 0 }
      })()
      const remoteLine = sayItWasDoneFromAnotherComputer(req, `The agent "${done.agent.handle}" was retired`)
      return { agent: done.agent, keysRevoked: done.keysRevoked, ...(done.noWrites && remoteLine === null ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}) }
    },
  )

  // THE PICTURE ON THE ROUND CHAT BUTTON, criterion M38. Its own address and not one of the avatar
  // sets, because these belong to the product rather than to anybody: `circlePictureBytes` says why.
  app.get('/chat-circle/:name', route('chat.circle.picture', 'remote', CIRCLE_PICTURE_NOTE), async (req, reply: FastifyReply) => {
    const asked = parse(z.object({ name: z.string().min(1) }).strict(), req.params, 'The picture asked for')
    const found = circlePictureBytes(asked.name)
    void reply.header('content-type', found.mime)
    void reply.header('cache-control', found.cacheControl)
    return reply.send(found.body)
  })

  app.get('/assets/:id', route('asset.read', 'remote', ASSET_NOTE), async (req, reply: FastifyReply) => {
    const asked = parse(z.object({ id: z.string().min(1) }).strict(), req.params, 'The picture asked for')
    const found = theAvatarToSend(asked.id)
    if ('drawing' in found) {
      void reply.header('content-type', found.mime)
      void reply.header('cache-control', found.cacheControl)
      return reply.send(found.drawing)
    }
    // AN UPLOAD IS SENT FROM ITS FILE, and not read whole first (wave 13y round 34).
    const file = openToSend(found.file)
    void reply.header('content-type', found.mime)
    void reply.header('cache-control', found.cacheControl)
    return sendTheOpenFile(req, reply, found.file, file, 'whole')
  })

  app.get('/avatars', route('avatar.on-offer', 'remote', ON_OFFER_NOTE), async (req) => {
    const asked = parse(whoIsBeingOfferedOne, req.query ?? {}, 'The participant asked about')
    const avatars = avatarsOnOffer()
    if (asked.for === undefined) return { avatars, offered: null, offeredFor: null }
    const named = participantFromKey(asked.for)
    if (named === null) {
      throw new PanelError(
        `"${asked.for}" does not name a participant. Write the kind and the id with a colon between them, ` +
          'as in "agent:aGtxQ1xBvNa2".',
        400,
      )
    }
    const who = theParticipantThePathNames(named, 'reading')
    const held = readParticipant(who)
    if (held === null) {
      throw new PanelError(`No ${participantWord(who.kind)} in this installation answers to "${who.id}".`, 404)
    }
    const offered: AvatarOnOffer | null = avatarOfferedTo(who, held.avatarAssetId, avatars)
    return { avatars, offered, offeredFor: who }
  })

  app.get(
    '/avatars/:set/:name',
    route('avatar.on-offer.bytes', 'remote', ON_OFFER_BYTES_NOTE),
    async (req, reply: FastifyReply) => {
      const asked = parse(whichPictureOnOffer, req.params, 'The picture asked for')
      if (!isAvatarSetName(asked.set)) {
        throw new PanelError(
          `There is no set of pictures called "${asked.set}". GET /api/avatars names the sets there are.`,
          404,
        )
      }
      const found = offeredAvatarBytes(asked.set, asked.name)
      void reply.header('content-type', found.mime)
      void reply.header('cache-control', found.cacheControl)
      return reply.send(found.body)
    },
  )
}

/**
 * Store what arrived, having first refused a caller who may not change this picture.
 *
 * THE PERMISSION IS ASKED ABOUT BEFORE A FILE IS WRITTEN. `setParticipantAvatar` refuses afterwards
 * too, and that refusal is the one that counts — but by then the file would be on disk with a row
 * naming somebody who was never allowed to send it, and nothing would take either away.
 */
function uploadedFrom(base64: string, who: ParticipantRef, by: ParticipantRef | null): ReturnType<typeof storeAvatarUpload> {
  const because = whyTheChangeIsRefused('avatar', who, by)
  if (because !== null) throw new PanelError(`${because} Nothing was written.`, 403)
  if (by === null) throw new PanelError('Nothing here knows who is asking. Nothing was written.', 403)
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0) {
    throw new PanelError('That picture arrived as base64 that decodes to nothing. Nothing was written.', 400)
  }
  return storeAvatarUpload(bytes, by)
}

const RELEASE_READING_NOTE =
  'Whether an agent reads a release from the check\u2019s own result. When it does, a release written to it does not ' +
  'wake it; a refusal always wakes it. GET reads it; POST {on, because} says it, by the agent with its own key or by ' +
  'the owner, and turns it off the same way. While the gate who-says-whether-another-agent-reads-releases is off, any ' +
  'agent proved by its own key may also say it for another agent, and is counted. Null means nobody has said, and a ' +
  'release wakes the agent.'

/** The one answer both doors give: what is stored, and what it means in words. */
function theReleaseReadingAnswer(agentId: string): { readsReleasesFromTheCheck: ReturnType<typeof theReleaseReadingOf>; says: string } {
  const said = theReleaseReadingOf(agentId)
  return {
    readsReleasesFromTheCheck: said,
    says:
      said === null
        ? 'Nobody has said. A release to this agent wakes it.'
        : said.on
          ? 'This agent reads a release from the check. A release to it does not wake it; a refusal does.'
          : 'This agent does not read a release from the check. A release to it wakes it.',
  }
}
