// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { STORAGE_REFUSAL_CODES } from './storage/refusals.ts'
import { CONVERSATION_EXPORT_REFUSAL_CODES } from './conversation-export.ts'
import type { WordValues } from './i18n.ts'

/** Page refusals and the values each one needs, on plan 7FEOshq3mBGG. */
export const ADDRESS_AND_RECORD_REFUSAL_CODES = {
  addressPersonNeedsSecretary: {},
  addressPersonCannotSetAnother: {},
  addressPersonNotProved: {},
  addressOwnerNotProved: {},
  addressNotFromAgent: {},
  addressAgentKeyMissing: {},
  addressAgentCannotSetAnother: {},
  recordNotFound: {},
  recordFieldWouldBeEmptied: {},
  recordFieldsWouldBeEmptied: { count: 'number' },
} as const

/** Private subscription sign-in refusals contain no provider material. */
export const PRIVATE_LOGIN_REFUSAL_CODES = {
  privateLoginUnavailable: {},
  privateLoginBusy: {},
  privateLoginUnsupported: {},
  privateLoginExpired: {},
  privateLoginBinding: {},
  privateLoginInputUsed: {},
  privateLoginPoolUnknown: {},
  privateLoginPerson: {},
  privateLoginShape: {},
} as const
export type PrivateLoginRefusalCode = keyof typeof PRIVATE_LOGIN_REFUSAL_CODES

/** An original upgrade history read could not be verified or had invalid options. */
export const UPGRADE_HISTORY_REFUSAL_CODES = { upgradeHistoryReadRefused: {} } as const
export const BOOTSTRAP_STOP_REFUSAL_CODES = {
  dataMoveShapeRefused: {}, dataMoveCallerRefused: {}, dataMoveDecisionRefused: {}, dataMoveWarrantRefused: {},
  dataMoveScopeRefused: {}, dataMoveReservationRefused: {}, dataMoveActMissing: {}, dataMoveActAmbiguous: {},
  dataMoveNoticeRefused: {},
  bootstrapStopShapeRefused: {}, bootstrapStopCallerRefused: {}, bootstrapStopPreparedRefused: {},
  bootstrapStopDecisionRefused: {}, bootstrapStopWarrantRefused: {}, bootstrapStopScopeRefused: {},
  bootstrapStopTimeRefused: {}, bootstrapStopReservationRefused: {},
} as const

/** An observed cloud receipt cannot be supplied by renaming another kind. */
export const RECEIPT_REFUSAL_CODES = { receiptNeedsOriginalRun: {} } as const

/**
 * The machine names door's refusals (problem 8Kf0hCaK4lQY), which the Settings entry draws. In a list of their own so
 * their words sit in wave 13n's own section of the word lists.
 */
export const MACHINE_NAMES_REFUSAL_CODES = {
  machineAddressNotAnAddress: {},
  machineNameNotAName: {},
  machineNameNothingToRemove: {},
  machineNamesOwnerNotProved: {},
  machineNamesUnreadable: {},
  machineNamesNoInstallationRow: {},
} as const

/**
 * The package workers door's refusal that the package page draws (wave 13n, package OP): an ask whose recorded time is
 * empty. The value is the worker handle the English sentence names. In a list of its own so its words sit in wave 13n's
 * own section of the word lists.
 */
export const PACKAGE_WORKER_ASK_REFUSAL_CODES = {
  packageWorkerAskHasNoTime: { worker: 'string' },
} as const

/**
 * A decision that does not say what it replaces (problem ZSWftCSVUP2r). The Decisions page draws it when their press on a
 * fork meets it. Two codes, because the page says whether earlier decisions on the same subjects were found; the full
 * English refusal names them.
 *
 * THE WITH-CANDIDATES CODE IS NAMED ONCE, here, so the refusal that throws it and the test that reads it cannot
 * disagree about its spelling. Both import this constant.
 */
export const DECISION_REPLACES_UNSAID_WITH_CANDIDATES = 'decisionReplacesUnsaidWithCandidates'

export const DECISION_REPLACES_REFUSAL_CODES = {
  decisionReplacesUnsaid: {},
  [DECISION_REPLACES_UNSAID_WITH_CANDIDATES]: {},
} as const

/**
 * The office regulations' Chinese halves: a write that would leave a Chinese half
 * not written from the English beside it. In a list of their own so their words sit in section R12b of the
 * word lists.
 */
export const CHINESE_HALF_REFUSAL_CODES = {
  // NO VALUES: the page sentence names no raw field and no hash (the never-show scan). The English
  // reply an agent reads names both.
  chineseHalfNotFromThisEnglish: {},
} as const

/**
 * The Casting table's write door refusals that the Casting page can draw: a write refused to
 * somebody who is neither the owner nor an agent whose own key proves a card that holds the act, which
 * the secretary card holds, and a value or decision typed that the door cannot
 * store.
 */
export const CASTING_REFUSAL_CODES = {
  // THE CARD THAT HOLDS THE ACT, as the gate read it from the role cards; the page draws it in its own language.
  castingNotOwnerOrSecretary: { card: 'string' },
  castingNotAProgram: { program: 'string' },
  castingNoSuchDecision: { id: 'string' },
  castingNotADecision: { id: 'string' },
  castingDecisionDeleted: { id: 'string' },
  castingEmptyCellNamesADecision: {},
  // SEVERAL CASTINGS FOR EACH ROLE: a casting the page drew that is no longer there, and the
  // marked casting refused while others remain in its scope.
  castingNoSuchCasting: { id: 'string' },
  castingRemoveTheMarkedRow: {},
} as const

/**
 * The Casting gate's refusal where no card or more than one card holds the act (problem XCvn6ypadyMT). Its page sentence
 * names no card, since one card name would leave the others out. In a list of its own so its words sit in wave 13p's
 * own section of the word lists.
 */
export const CASTING_CARDS_REFUSAL_CODES = {
  castingNotOwnerOrACardThatHoldsIt: {},
} as const

/**
 * A revoke at the Embassy that names no key by its id (problem yZ71bheXm-Ji). The citizen's page draws it if a press
 * ever meets it. In a list of its own so its words sit in section R13a of the word lists.
 */
export const EMBASSY_KEYS_REFUSAL_CODES = {
  embassyKeysNoKeyNamed: {},
} as const

/**
 * A raise's end time that the raise door cannot take (problem OpT-wLSCwlZ-): one that does not read as a date and a
 * time, and one that has already come. In a list of their own so their words sit in section R14d of the word lists.
 */
export const RAISE_UNTIL_REFUSAL_CODES = {
  raiseUntilUnreadable: { typed: 'string' },
  raiseUntilPassed: { until: 'string' },
} as const

/**
 * An agent asking to end a raise that was given to another agent: an agent may end only its own
 * raise. In a list of its own so its words sit in section R15b of the word lists.
 */
export const RAISE_END_REFUSAL_CODES = {
  raiseEndNotYours: {},
} as const

/**
 * The chat's page of conversations: both conversation cursor refusals carry a page code. The unreadable cursor has no
 * values; a cursor made for another project carries the two projects its sentence names. In a list of its own, so the
 * words sit together.
 */
export const AGENT_CONVERSATIONS_CURSOR_INVALID = 'agentConversationsCursorInvalid'
export const AGENT_CONVERSATIONS_CURSOR_PROJECT = 'agentConversationsCursorProject'
export const AGENT_CONVERSATIONS_REFUSAL_CODES = {
  [AGENT_CONVERSATIONS_CURSOR_INVALID]: {},
  [AGENT_CONVERSATIONS_CURSOR_PROJECT]: { from: 'string', to: 'string' },
} as const

/** In a list of its own, so its words sit in wave 13y's own section of the word lists. */
export const MESSAGE_QUOTE_POSITIONS_INVALID = 'messageQuotePositionsInvalid'
export const MESSAGE_QUOTE_POSITION_REFUSAL_CODES = {
  [MESSAGE_QUOTE_POSITIONS_INVALID]: {},
} as const

/**
 * Who may change a message, from problem L6joIpuePIvP. The comment box on a record's
 * page and the review pane draw these when an edit, a delete or a kind change of a message is refused.
 */
export const MESSAGE_CHANGE_REFUSAL_CODES = {
  messageStaysAMessage: {},
  messageIsTheOfficesNotice: {},
  messageNotYourWords: {},
  messageFieldNotAWord: {},
  messageEditWindowClosed: { seconds: 'number' },
  messageWrittenInNoProject: {},
  messageLinkedAcrossProjects: {},
} as const

/**
 * A comment on a fact beside a line of a plan (problem ON-vXSmgokHf) that names a fact a line does not have, or a
 * plan or line that is no longer there. The composer draws it when a press meets it. In a list of its own so its words
 * sit in section R16d of the word lists.
 */
export const PLAN_LINE_FACT_REFUSAL_CODES = {
  planLineFactUnknown: {},
  planLineFactGone: {},
} as const

/**
 * A write to a plan built on a copy somebody has since changed (problem GR4LcaNI-XZk). The plan pages draw it: the
 * name, the state presses and a table cell. NO VALUES: the page sentence names no version token and no stamp (the
 * never-show scan). The English reply an agent reads names both. In a list of its own so its words sit in section
 * R16b of the word lists.
 */
export const PLAN_VERSION_REFUSAL_CODES = {
  planChangedSinceRead: {},
} as const

/**
 * Permanent residents and their personal spaces, from proposal GsGFiDygATd5: the refusals a
 * person's press on the residents' pages can meet, and the address refusals a resident's address card can
 * meet, at answer 8. In a list of their own so their words sit in wave 13r's own section
 * of the word lists.
 */
export const RESIDENT_REFUSAL_CODES = {
  addressResidentIsItsOwn: {},
  addressResidentKeyMissing: {},
  addressResidentOwnerNotProved: {},
  residentNoSuchProposal: {},
  residentProposalSettled: {},
  residentNoLongerEligible: {},
  residentFolderAlreadyThere: {},
  residentFolderNotMade: {},
  residentSpaceIsPrivate: {},
  residentVoidNeedsAReason: {},
  residentOriginsNeverVoid: {},
  residentNoSuchFile: {},
  residentAlreadyVoid: {},
  residentNoSuchGrant: {},
  residentGrantAlreadyEnded: {},
  residentNotRetired: {},
  residentSuccessorAlreadyNamed: {},
  residentNoSuchSuccessor: {},
  residentSuccessorIsItself: {},
  residentSuccessorNotAnAgent: {},
  residentProposalHasNoSleepTime: {},
  residentProposalHasItsOwnDoors: {},
} as const

/**
 * The answer door's refusals that the questions in a report draw: a press
 * by somebody who is not the person, a send with nothing unsent, answers with nobody to go to, an agent that cannot take
 * a message, and an option that is not the question's own. In a list of their own so their words sit in wave 13k's own
 * section of the word lists.
 */
export const ANSWER_REFUSAL_CODES = {
  answerNotThePerson: {},
  answersNothingUnsent: {},
  answersNobodyToSendTo: {},
  // THE AGENT'S NAME as its registry row holds it, which the page draws in its sentence.
  answersReceiverCannotTakeAMessage: { agent: 'string' },
  answerNotAnOption: {},
} as const

/**
 * The refusals of the door that names who takes the dead letters (problem 0WUuvB0IhRfb), which the Settings panel
 * draws. In a list of their own so their words sit in wave 13n's own section of the word lists.
 */
export const DEAD_LETTER_SECRETARY_REFUSAL_CODES = {
  deadLetterSecretaryOwnerNotProved: {},
  deadLetterSecretaryNoSuchAgent: {},
  deadLetterSecretaryNotRegistered: {},
  deadLetterSecretaryRetired: {},
  deadLetterSecretaryNoAct: {},
  deadLetterSecretaryUnreadable: {},
  deadLetterSecretaryNoInstallationRow: {},
} as const

/**
 * The refusals of the door that names the merge queue's owner, which the Settings panel draws.
 * In a list of their own so their words sit in wave 13t's own section of the word lists.
 */
export const MERGE_QUEUE_OWNER_REFUSAL_CODES = {
  mergeQueueOwnerOwnerNotProved: {},
  mergeQueueOwnerNoSuchAgent: {},
  mergeQueueOwnerNotRegistered: {},
  mergeQueueOwnerRetired: {},
  mergeQueueOwnerNotASecretary: {},
  mergeQueueOwnerUnreadable: {},
  mergeQueueOwnerNoInstallationRow: {},
} as const

/**
 * The refusals of the door that sets who is reminded about each project's modules (wave 13p round 29, decision
 * aZGg6gerakM1), which the Settings panel draws. In a list of their own so their words sit in wave 13p's own section.
 */
export const MODULE_REMINDER_SECRETARY_REFUSAL_CODES = {
  moduleReminderSecretaryNotAllowed: {},
  moduleReminderSecretaryNeedsAReason: {},
  moduleReminderSecretaryNoSuchProject: {},
  moduleReminderSecretaryNoSuchAgent: {},
  moduleReminderSecretaryRetired: {},
  moduleReminderSecretaryNotASecretary: {},
  moduleReminderSecretaryUnreadable: {},
} as const

/**
 * The question Mole Office writes for having a review's comments read (organiseRequest in src/server/lib/reviews.ts),
 * refused because nothing in the review can be read. The review column's "Have these comments read" panel draws it.
 * In a list of its own so its words sit in wave 13n's own section of the word lists.
 */
export const REVIEW_ASK_REFUSAL_CODES = {
  reviewNothingToRead: {},
} as const

/**
 * The words of a note the person wrote are theirs, at check ekidFZV6r1Yt: a change by
 * anybody else is refused. In a list of its own so its words sit in wave 13r's own
 * section of the word lists.
 */
export const OWN_WORDS_REFUSAL_CODES = {
  noteWordsAreThePersons: {},
} as const

/**
 * The terminal doors' refusals the terminal pages can meet (wave 13u, round 2): drawn in the page's language by
 * src/web/components/TerminalView.tsx and the terminal pages. Their words sit in wave 13u's section.
 */
export const TERMINAL_REFUSAL_CODES = {
  terminalsOnlyThePerson: {},
  terminalHolderNotRunning: {},
  terminalHolderNoAnswer: {},
  terminalHolderUnusable: {},
  terminalNotHeld: {},
  terminalEnded: {},
  // KEEPING A LINE THE PERSON TYPED AS THEIR OWN WORDS (round 3).
  terminalNoLineToKeep: {},
  terminalLineChanged: {},
  // STARTING THE HOLDER FROM THE PAGE (round 3).
  terminalHolderDidNotStart: {},
  terminalHolderTurnedOff: {},
} as const

/**
 * Closing an agent's terminal under the grant (wave 13s round 81). In a list of its own so its words sit in wave 13s's
 * section of the word lists.
 */
export const TERMINAL_GRANT_REFUSAL_CODES = { terminalHoldsAnAgentsRun: {} } as const

/**
 * The folder a plain terminal opens in, refused by POST /api/terminals (wave 13u, round 7b). Each names the folder and
 * says what to write instead. Apart from TERMINAL_REFUSAL_CODES because these carry a value and those carry none.
 */
export const TERMINAL_FOLDER_REFUSAL_CODES = {
  terminalFolderNotAbsolute: { folder: 'string' },
  terminalFolderMissing: { folder: 'string' },
  terminalFolderIsAFile: { folder: 'string' },
} as const

/** The folder read refuses a spelling that cannot name one absolute folder. */
export const REPORT_FILES_REFUSAL_CODES = {
  reportFilesFolderUnusable: {},
} as const

/**
 * The PDF door's refusals (POST /api/report-pdf, src/server/api/report-pdf.ts): no screen to print on, another print
 * running, a page past the door's limit, and each way a print gives no PDF. A print did not finish in time, could
 * not start, or wrote no PDF; or it ended with an exit code or a signal, each with the program's last line where it
 * wrote one.
 */
export const REPORT_PDF_REFUSAL_CODES = {
  reportPdfNoDisplay: {},
  reportPdfBusy: {},
  reportPdfTimedOut: { seconds: 'number' },
  reportPdfCouldNotStart: {},
  reportPdfWroteNoPdf: {},
  reportPdfExited: { code: 'number' },
  reportPdfExitedSaying: { code: 'number', line: 'string' },
  reportPdfSignalled: { signal: 'string' },
  reportPdfSignalledSaying: { signal: 'string', line: 'string' },
  reportPdfTooLarge: { megabytes: 'number' },
} as const

/**
 * The install press's refusals (wave 13u round 3, src/server/api/terminal-harnesses.ts), which the panel on Terminal
 * management draws. The refusals of the terminal holder it can also meet are TERMINAL_REFUSAL_CODES above.
 */
export const HARNESS_REFUSAL_CODES = {
  harnessesOnlyThePerson: {},
  harnessUnknown: {},
  harnessHasNoInstaller: {},
  harnessNoneTicked: {},
  harnessNoHome: {},
} as const

/**
 * Setting up an agent tool (wave 13u round 242, src/server/lib/setting-up-an-agent-tool.ts): its first install on the
 * person's own message, its key given to its own login, and its account sign-in, at src/server/api/terminal-harnesses.ts.
 */
export const AGENT_TOOL_SETUP_REFUSAL_CODES = {
  harnessNoSuchTool: {},
  harnessInASandbox: {},
  harnessMessageTimeUnread: {},
  harnessNotInstalled: {},
  harnessNoKeyLogin: {},
  harnessSignsInWithAnAccount: {},
  harnessKeyShape: {},
  harnessKeyProvider: {},
  harnessKeyLoginNotThisVersion: { found: 'string', checked: 'string' },
  harnessKeyLoginFailed: {},
  harnessNoSignIn: {},
  harnessSignInFailed: {},
  harnessSetUpIsThePersons: {},
  harnessNoSecretary: {},
  harnessSignInCodeShape: {},
  harnessNoSuchSignIn: {},
  harnessSignInTakesNoCode: {},
  harnessSignInEnded: {},
  harnessSignInCodeGiven: {},
} as const

/**
 * A gated operation that waits for readiness signatures (src/server/lib/readiness.ts). It is not a failure: the
 * caller's signature is recorded, and the office runs the operation itself when the last signer signs. The page reads
 * the checklist by its id to say who it waits for.
 */
export const READINESS_REFUSAL_CODES = {
  readinessWaits: { checklist: 'string' },
} as const

/**
 * The start-at-login doors' refusals (wave 13u, round 3, piece H9), drawn in the page's language by
 * src/web/components/StartAtLogin.tsx on Terminal management. Their words sit in that piece's place in the word lists.
 */
export const START_AT_LOGIN_REFUSAL_CODES = {
  startAtLoginOnlyThePerson: {},
  startAtLoginTestWorld: {},
  startAtLoginNotLinux: {},
  startAtLoginNoSystemd: {},
  startAtLoginNotOurs: { path: 'string' },
  startAtLoginSystemdRefused: {},
} as const

/**
 * Start at login's refusals when the unit it wrote before cannot be copied to a free backup name, or the new unit
 * cannot be written (wave 13t, round W26, src/config/start-at-login.mjs). Each path is the file the refusal names.
 * Round W28 added two: a first unit whose write failed and whose file beside it could not be removed, and a file where
 * a folder of the unit goes. Their words are in wave 13t's place in the word lists, in English only until the
 * translation round. The press's refusal in an AppImage is here for the same reason: the list above is typed against
 * the core English and the Chinese lists, and its words are in English only, in wave 13t's place. So are the three
 * refusals of the press Off in an AppImage, which disables a unit a press wrote, copies it and removes it: its copy
 * failed, its removal failed, or systemd would not read its units again. Each path is the copy, or the name it failed at.
 */
export const START_AT_LOGIN_BACKUP_REFUSAL_CODES = {
  startAtLoginNotBackedUp: { path: 'string' },
  startAtLoginNotWritten: { path: 'string' },
  startAtLoginCopyLeft: { path: 'string' },
  startAtLoginUnitKeptFileLeft: { path: 'string' },
  startAtLoginCopyAndFileLeft: { path: 'string', beside: 'string' },
  startAtLoginFileLeft: { path: 'string' },
  startAtLoginUnderAFile: { path: 'string' },
  startAtLoginInAnAppImage: {},
  startAtLoginOffNotCopied: { path: 'string' },
  startAtLoginOffNotRemoved: { path: 'string' },
  startAtLoginOffNotReloaded: { path: 'string' },
} as const

/**
 * The data folder doors' refusals (criteria DF4 and DF17 to DF21, src/server/api/data-folder.ts and the stored files'
 * reader in src/server/api/files.ts). The door's own refusals name the runs at work, the end of the mover's log, or the
 * group and the log the mover was started with. The grant's check's refusal carries its own sentence, and an unreadable
 * move mark's refusal at the door carries the mark's path and why.
 *
 * From dataFolderPlaceNotAFullPathFromSlash on, the codes are the refusals of the move's check, its walk and its
 * confirm. Their English is written once, in src/config/the-data-folder-move-words.mjs. A sentence the mover picks
 * from several has a code of its own, so no words the mover picks are sent as a value. A value that holds words made
 * elsewhere keeps them as they came: the place as it was written, a mark's or a drive's reason, and a file system's
 * error. dataFolderMoveRefused carries any other error of the walk that way, and its words are in that file too.
 * Their words sit in wave 13t's place in the word lists.
 */
export const DATA_FOLDER_REFUSAL_CODES = {
  dataFolderOnlyThePerson: {},
  dataFolderTestWorld: {},
  dataFolderNoWayToStart: {},
  dataFolderNotABundle: {},
  dataFolderRunsAtWork: { runs: 'string' },
  dataFolderMoveStarting: {},
  dataFolderMoveRefused: { why: 'string' },
  dataFolderMoverEnded: { log: 'string' },
  dataFolderMoverNotSeen: { group: 'string', log: 'string' },
  dataFolderNotUnderTheGrant: { why: 'string' },
  dataFolderMarkUnreadable: { mark: 'string', why: 'string' },
  dataFolderPlaceNotAFullPathFromSlash: { place: 'string', example: 'string' },
  dataFolderPlaceNotAFullPathOnWindows: { place: 'string', example: 'string' },
  dataFolderPlaceNotEmpty: { to: 'string' },
  dataFolderPlaceIsTheDataFolder: { to: 'string' },
  dataFolderPlaceInsideTheDataFolder: { to: 'string', from: 'string' },
  dataFolderPlaceHoldsTheDataFolder: { to: 'string', from: 'string' },
  dataFolderPlaceInTheInstallFolder: { to: 'string', installFolder: 'string' },
  dataFolderPlaceHasNoFolder: { to: 'string' },
  dataFolderPlaceHasTooLittleRoom: { to: 'string', freeBytes: 'number', folderBytes: 'number' },
  dataFolderProcessEnvironmentDecides: {},
  dataFolderMoveStillRunning: { mark: 'string', state: 'string', pid: 'number', from: 'string', to: 'string' },
  dataFolderMoveNotConfirmed: { to: 'string', mark: 'string', state: 'string' },
  dataFolderMoveRunningUnknown: { mark: 'string', why: 'string' },
  dataFolderPlaceInTheTemporaryFolder: { to: 'string', folder: 'string', variable: 'string' },
  dataFolderPlaceIsANetworkPath: { to: 'string' },
  dataFolderPlaceOnANetworkDrive: { to: 'string', drive: 'string' },
  dataFolderDriveNotRead: { to: 'string', drive: 'string', why: 'string' },
  dataFolderDriveTypeUnknown: { to: 'string', drive: 'string', type: 'string' },
  dataFolderDriveNotAsked: { to: 'string', drive: 'string' },
  dataFolderLoginUnitNotOurs: { unit: 'string' },
  dataFolderLoginUnitNotOursRuns: { unit: 'string' },
  dataFolderLoginUnitInAnAppImage: { unit: 'string' },
  dataFolderLoginUnitStartsAtLogin: { unit: 'string' },
  dataFolderLoginUnitStartsAtLoginRuns: { unit: 'string' },
  dataFolderLoginUnitMayStartAtLogin: { unit: 'string' },
  dataFolderLoginUnitMayStartAtLoginRuns: { unit: 'string' },
  dataFolderLoginUnitRuns: { unit: 'string' },
  dataFolderLoginUnitOff: { unit: 'string' },
  dataFolderWalkMetASymbolicLink: { folder: 'string', name: 'string', path: 'string' },
  dataFolderWalkMetASpecialFile: { folder: 'string', name: 'string' },
  dataFolderWalkMetMoreNames: { path: 'string', links: 'number', found: 'number' },
  dataFolderConfirmNeedsAStartedMove: { mark: 'string', state: 'string' },
  dataFolderConfirmCannotReadTheOldFolder: { mark: 'string', from: 'string', why: 'string' },
  dataFolderConfirmNeedsTheNewDatabase: { mark: 'string', wanted: 'string', inUse: 'string' },
  dataFolderConfirmWaitsForTheMover: { mark: 'string', pid: 'number' },
  dataFolderNoMoveToConfirm: { mark: 'string' },
} as const

/**
 * The mail tool's press and its turn-off refused when a file stands where a folder of its service goes (wave 13t, round
 * W28, src/config/the-mail-tool.mjs). The path is that file. Its words are in wave 13t's place in the word lists, in
 * English only until the translation round.
 */
export const MAIL_TOOL_REFUSAL_CODES = {
  mailToolUnderAFile: { path: 'string' },
} as const

/**
 * A request inside the installed Windows app refused because the operating system did not say in time which program sent
 * it (src/server/lib/from-a-sandbox.ts). The seconds are how long it was waited for. The page reads the code and asks
 * the request again (src/web/api.ts). Its words are in English only until the translation round.
 */
export const SENDER_READING_REFUSAL_CODES = {
  senderNotReadInTime: { seconds: 'number' },
} as const

/**
 * The sandbox memory limit's refusals, drawn in the page's language by
 * src/web/components/SandboxMemoryCap.tsx on the Settings page. What the press itself
 * answers is not a refusal: it is the outcome in src/shared/sandbox-memory-cap.ts.
 */
export const SANDBOX_CAP_REFUSAL_CODES = {
  sandboxCapOnlyThePerson: {},
  sandboxCapTestWorld: {},
} as const

/**
 * The refusals of the door that opens an agent in a terminal (wave 13u, round 3: POST /api/terminals/agents), which an
 * agent's Terminals panel meets. In a list of their own so their words sit in round 3's own place in the word lists.
 */
export const TERMINAL_AGENT_REFUSAL_CODES = {
  terminalAgentNotFound: {},
  terminalAgentRetired: {},
  terminalAgentNoRuntime: {},
  terminalAgentDshNotInteractive: {},
  terminalAgentNoStartFolder: {},
  terminalAgentStartFolderGone: {},
  terminalAgentTrustUnsafe: {},
  terminalAgentProgramMissing: {},
  terminalAgentNothingToResume: {},
} as const

/**
 * The refusals when a run still runs as an agent's terminal is opened. In a list of their own so their words sit in
 * wave 13u's own place in the word lists.
 */
export const TERMINAL_AGENT_STILL_RUNS_REFUSAL_CODES = {
  terminalAgentRunsHere: { run: 'string', pid: 'number' },
  terminalAgentInTheOfficesTerminal: { run: 'string', terminal: 'string' },
  terminalAgentRunsInASandbox: { run: 'string' },
  terminalAgentRunsInAnotherProject: { project: 'string' },
} as const

/**
 * The refusals of the way back's press (wave 13u, round 10: POST /api/terminals/agents/:agent/way-back), which the way
 * back on an agent's page meets. In a list of their own so their words sit in round 10's own place in the word lists.
 */
export const WAY_BACK_REFUSAL_CODES = {
  wayBackNoRun: {},
  wayBackNotThisAgents: {},
  wayBackNone: {},
  wayBackStillRunning: {},
  wayBackInASandbox: {},
  wayBackFolderGone: {},
} as const

/**
 * An agent's tmux pane, shown on its page (wave 13u, round 10, way B: GET and POST /api/terminals/agents/:agent/pane).
 * Each says why the pane cannot be shown, in the page's language. Their words sit in wave 13u's round 10 section.
 */
export const AGENT_PANE_REFUSAL_CODES = {
  paneNoRun: {},
  paneInASandbox: {},
  paneNotRunning: {},
  paneNotInATerminal: {},
  paneNotInTmux: {},
  paneNoTmux: {},
} as const

/**
 * A sandboxed run's steps, refused because the conversation its record names is not inside the run's own sandbox home
 * (wave 13u, round 10b: GET /api/terminals/agents/:agent/steps). Its words sit in wave 13u's round 10b section.
 */
export const AGENT_STEPS_REFUSAL_CODES = {
  stepsOutsideTheHome: {},
} as const

/**
 * What a decision governs: a lookup that sends both or neither of `path` and `record`, and a
 * `governs` entry naming a record a decision cannot govern. The full English refusal names each record and why.
 */
export const GOVERNS_REFUSAL_CODES = {
  governingAskExactlyOne: {},
  governsNamesRecordsItCannotGovern: {},
} as const

/**
 * The planning flow's two doors, at wave 13j round 49: POST /api/modules/:id/plan-step-done and
 * POST /api/modules/:id/plan, and the guard that keeps a module's `planning` to those
 * doors. The full English refusal names the module, the pipeline or the planner. Its
 * words sit in wave 13j's round 49 section.
 */
export const PLANNING_FLOW_REFUSAL_CODES = {
  planNotAModule: {},
  planModuleNamesNoPlanner: {},
  planCallerIsNotThePlanner: {},
  planNeedsARun: {},
  planModuleHasNoPipeline: {},
  planPipelineNotTheModules: {},
  planChecklistNotThePlanners: {},
  planStepAlreadyDone: {},
  planNotOpen: {},
  planItemTickedByAnother: {},
  planWrittenOutsideItsDoors: {},
  // Wave 13j round 51: who may name, change or drop a module's planner (report FRsTZ627KvQQ).
  plannerNamedByAnother: {},
} as const

/**
 * What a write to a flow's steps lacks, worked out by `whatTheFlowStepsLack` in
 * src/shared/flow-steps.ts for the server and the flow editor alike (wave 13p, round 33). The full English refusal names
 * the steps and quotes what a changed or removed step said; the page places each by its code.
 */
export const FLOW_STEP_REFUSAL_CODES = {
  flowStepNoWhy: {},
  flowStepNoSources: {},
  flowStepChangesRewritten: {},
  flowStepChangeUnrecorded: {},
  flowStepChangeNoCause: {},
  flowStepRecordNotThere: {},
} as const

/**
 * What the five write doors of the Flows page refuse beside the six above, from wave 13p round 34 and a
 * decision: a version that is not the flow's, a project that is not there, a stage or a place
 * that is not there, a move to where the stage already is, a change that changes nothing, and a move or a remove with
 * no why. All but the first two are worked out by `buildAFlowStageWrite` in src/shared/flow-step-writes.ts, for the
 * server and the editor.
 */
export const FLOW_WRITE_REFUSAL_CODES = {
  flowVersionStale: {},
  flowProjectNotThere: {},
  flowStageNotThere: {},
  flowStagePlaceNotThere: {},
  flowStageAlreadyThere: {},
  flowStageUnchanged: {},
  flowChangeNoWhy: {},
  // Wave 13p round 40: whom a flow is for, `applies_to`, that the office cannot store (src/shared/flow-applies-to.ts).
  flowAppliesToUnreadable: {},
  // Wave 13p round 40b: a flow's retired mark, `retired`, that the office cannot store (src/shared/flow-retired.ts).
  flowRetiredUnreadable: {},
} as const

/**
 * The shutdown door's refusals, at criterion W6, drawn in the page's language by
 * src/web/components/ShutDown.tsx: a press by anybody but the owner, the grant or a secretary carrying the owner's
 * written words; the owner's words that do not name this act; and a run that started after the list the press
 * confirmed was read.
 */
export const SHUT_DOWN_REFUSAL_CODES = {
  shutDownOnlyTheOwner: {},
  shutDownBadWarrant: { reason: 'string' },
  shutDownRunsChanged: { count: 'number' },
} as const

/**
 * Entering a flow, at wave 13j round 52: POST /api/flows/:id/enter, and the hand tick of the item
 * the office puts on the agent's checklist. The full English refusal names the flow,
 * the run and the agent.
 */
export const ENTERED_FLOW_REFUSAL_CODES = {
  flowNotAFlow: {},
  flowAboutNotHere: {},
  flowNeedsARun: {},
  flowRunServesNoAgent: {},
  flowEnteredForAnother: {},
  flowEnteredByItsOwnDoor: {},
  flowAlreadyEntered: {},
  flowChecklistNotTheirs: {},
  flowItemTickedByAnother: {},
  // Round 52b: any other change to that item, by anybody but the person or the agent in the flow, until it ends.
  flowItemChangedByAnother: {},
} as const

/**
 * A change to a checklist's item sent with a version the checklist no longer has (wave 13j round loop-8). A press on an
 * item meets it when the checklist changed after the page read it, and the page then reads it again. The full English
 * refusal names both versions.
 */
export const CHECKLIST_VERSION_REFUSAL_CODES = {
  checklistChangedSinceRead: {},
} as const

/**
 * THE OWNER'S OWN WRITTEN WORDS ON A CHECKLIST ITEM, wave 14a round 1, on a message. The item
 * door writes them only for the checklist's own owner, only in the press that marks the item done, and only with the
 * version the checklist had when it was read; each refusal says which of the three is missing. The full English
 * refusal names the checklist, the owner or the item.
 */
export const CHECKLIST_OWN_WORDS_REFUSAL_CODES = {
  checklistOwnWordsNotTheOwner: {},
  checklistOwnWordsNeedTheDonePress: {},
  checklistOwnWordsNeedTheVersion: {},
} as const

/**
 * The items a run's starter asks the reminder before the seal to name (wave 13j round 54): PUT /api/records/:id/check-also.
 * The limits are in the words, so no values are sent.
 */
export const CHECK_ALSO_REFUSAL_CODES = {
  checkAlsoNotARun: {},
  checkAlsoTooMany: {},
  checkAlsoItemTooLong: {},
  checkAlsoByTheRunItself: {},
  checkAlsoWrittenOutsideItsDoor: {},
} as const

/**
 * An act kept on the computer the office runs on, asked from another one: a person who
 * meets it reads one plain sentence and one press, at point 3 of a decision.
 * The full English refusal names the act, the reason and the caller.
 */
export const KEPT_HERE_REFUSAL_CODES = {
  keptOnTheOfficesComputer: {},
} as const

/** A page from another world with no visit: the person sees the code's sentence and pairing press. */
export const VISIT_REFUSAL_CODES = {
  fromAnotherWorldWithNoVisit: {},
} as const

/** A request that the office could not attribute under its key and key-window rules. */
export const IDENTITY_REFUSAL_CODES = {
  identityNotProved: {},
} as const

/**
 * The refusal of a Casting probability that is not a decimal from 0 to 1 or a percentage from 0% to 100% (wave 13s
 * round 44, migration 0268). In a list of its own so its words sit in wave 13s's own section of the word lists.
 */
export const CASTING_PROBABILITY_REFUSAL_CODES = {
  castingNotAProbability: { probability: 'string' },
} as const

/**
 * The refusals of the Casting labels (migration 0349): a name that is not a label, a name the table
 * holds, a label that is not there, a label a row carries, a row given a name the table does not hold, and an Out until
 * that is not a time. The Casting page draws them. These codes are kept in a separate list in
 * the word lists.
 */
export const CASTING_LABEL_REFUSAL_CODES = {
  castingNotALabel: { label: 'string' },
  castingLabelTaken: { label: 'string' },
  castingNoSuchLabel: { label: 'string' },
  castingLabelInUse: { label: 'string', rows: 'string' },
  castingNotALabelOfTheTable: { label: 'string' },
  castingNotAnOutUntil: { value: 'string' },
} as const

/**
 * The refusals of a Casting row's own program settings (src/config/the-launchers-own-settings.mjs): a row with no program,
 * a program that takes none, a name the launcher sets itself, and a Codex name with a part its -c cannot
 * name. A new row has no id yet, so each has a second code for it. In a list of its own so its words sit in wave 13n's
 * own section of the word lists.
 */
export const CASTING_SETTINGS_REFUSAL_CODES = {
  castingRowSettingsWithNoProgram: { id: 'string' },
  castingNewRowSettingsWithNoProgram: {},
  castingRowSettingsNotForProgram: { id: 'string', program: 'string' },
  castingNewRowSettingsNotForProgram: { program: 'string' },
  castingRowSetsAGuardedName: { id: 'string', name: 'string', program: 'string', guards: 'string' },
  castingNewRowSetsAGuardedName: { name: 'string', program: 'string', guards: 'string' },
  castingRowSetsAPartCodexCannotName: { id: 'string', name: 'string', part: 'string' },
  castingNewRowSetsAPartCodexCannotName: { name: 'string', part: 'string' },
} as const

/**
 * Quick inputs (wave 13u round 21; src/shared/quick-inputs.ts): the owner's list, an agent's ask
 * for an input from it, and the read of one agent's asks. The limits a list is held to are sent as values, so the words
 * do not hold a second copy of them; the time an agent may ask again is sent with `quickInputTooSoon`.
 *
 * ONE CODE FOR EACH RULE A LIST CAN BREAK (wave 13u round 31), because a page draws a refusal's sentence from its code
 * alone and a sentence cannot branch on a value: the code says which rule, and the values say which input (its place
 * in the list, and what a person can see of it) or what was wrong with the whole list. The rules about one input are
 * the six `quickInputListItem*` codes; the rules about the list are `quickInputListNotAList`, `quickInputListEmpty` and
 * `quickInputListTooMany`.
 */
export const QUICK_INPUT_REFUSAL_CODES = {
  quickInputBadBody: {},
  quickInputListOnlyThePerson: {},
  quickInputListNotAList: {},
  quickInputListEmpty: {},
  quickInputListTooMany: { most: 'number', count: 'number' },
  quickInputListItemNotWords: { place: 'number' },
  quickInputListItemEmpty: { place: 'number' },
  quickInputListItemTooLong: { place: 'number', longest: 'number', input: 'string' },
  quickInputListItemHoldsAKey: { place: 'number', input: 'string' },
  quickInputListItemNoSlash: { place: 'number', input: 'string' },
  quickInputListItemTwice: { place: 'number', input: 'string' },
  quickInputNoRun: {},
  quickInputRunNotFound: {},
  quickInputRunServesNoAgent: {},
  quickInputRunNotInATerminal: {},
  quickInputRunEnded: {},
  quickInputNotTheAgent: {},
  quickInputNoList: {},
  quickInputNotOnTheList: {},
  quickInputTooSoon: { nextAllowedAt: 'string' },
  quickInputNotTyped: {},
  quickInputTypedWithoutEnter: { nextAllowedAt: 'string' },
  quickInputTypingUnknown: { nextAllowedAt: 'string' },
  quickInputAsksUnknownAgent: {},
  quickInputAsksNoOffset: {},
  quickInputAsksBadLimit: { most: 'number' },
} as const

/**
 * Marking a project's master pipeline (wave 13u round 216, package BV; PUT /api/projects/:project/master-pipeline).
 * Each says why nothing was changed: who asked, a missing reason, or a project or record that cannot be the master.
 */
export const MASTER_PIPELINE_REFUSAL_CODES = {
  masterPipelineNotAllowed: {},
  masterPipelineNeedsAReason: {},
  masterPipelineNoSuchProject: {},
  masterPipelineNoSuchRecord: {},
  masterPipelineNotAPipeline: {},
  masterPipelineInAnotherProject: {},
} as const

/**
 * The dictionary of the big map (wave 13u round 216, package BV, point BV-6; GET /api/map/dictionary). Each says why
 * nothing was looked up: both or neither of path and module, or a module that is not a live module of this project.
 */
export const MAP_DICTIONARY_REFUSAL_CODES = {
  mapDictionaryAsksOneThing: {},
  mapDictionaryNoSuchModule: { module: 'string' },
} as const

/**
 * Restarting the terminal holder from Settings (wave 13u round 23; POST
 * /api/terminals/holder/restart). Each says what was done and where the holder was left: nothing stopped, stopped and
 * still running, stopped with no new holder, or a new holder that did not answer.
 */
export const TERMINAL_HOLDER_RESTART_REFUSAL_CODES = {
  terminalHolderRestartBadBody: {},
  terminalHolderRestartNoHolder: {},
  terminalHolderRestartChanged: {},
  terminalHolderRestartNotSignalled: {},
  terminalHolderRestartStillRuns: {},
  terminalHolderRestartNotStarted: {},
  terminalHolderRestartNoAnswer: {},
} as const

/**
 * Typing a line into the person's terminal for somebody else (wave 13s round 83; typeALineForSomebodyElse in
 * src/server/lib/terminals.ts, reached by the typing door when a secretary types one line). A terminal holder older than
 * this office, which cannot do it, and a line the person has half typed: nothing was typed in either. A secretary that
 * sent something other than one line, and owner's words that do not name this line in this terminal: nothing was typed
 * in either. A line typed whose Enter was not sent, because the person typed in the holder's pause or the terminal ended
 * in it: the line was typed, and it was written down. The same when the person pressed Enter on the line or cleared it
 * in the pause (round 86): the office's Enter would have been a second one. The quick-input door gives that last one
 * too, for an agent's quick input the person ended in the pause (round 87).
 */
export const TERMINAL_TYPED_FOR_ANOTHER_REFUSAL_CODES = {
  terminalHolderTooOld: {},
  terminalLineHalfTyped: {},
  terminalASecretaryTypesALine: {},
  terminalTypingWordsRefused: {},
  terminalTypedWithoutEnterThePersonTyped: {},
  terminalTypedWithoutEnterEnded: {},
  terminalTypedWithoutEnterThePersonEndedTheLine: {},
} as const

/**
 * A secretary opening a terminal for the person with a line prepared in it, the person naming a terminal, and one
 * reading of several terminals (src/server/api/terminals.ts). A prepared line with a key in it, a prepared line beside a
 * command, a prepared line the person sent, owner's words that do not name this folder and this line, and a holder
 * older than this office: nothing was opened in any of them. A name, a group or tags the office will not keep, and a
 * holder too old to keep them: nothing was changed. A reading that names no terminal, one twice or too many: nothing was
 * read.
 */
export const TERMINAL_PREPARED_REFUSAL_CODES = {
  terminalPreparedLineHasAKey: {},
  terminalPreparedLineWithACommand: {},
  terminalPreparedLineFromThePerson: {},
  terminalPreparingWordsRefused: {},
  terminalHolderTooOldToPrepare: {},
  terminalHolderTooOldToName: {},
  terminalNameRefused: {},
  terminalGroupRefused: {},
  terminalTagsRefused: {},
  terminalsReadingRefused: {},
} as const

/**
 * The commit a worker's worktree is cut from, refused at the worker-run door (wave 13j, the round after loop-10): a
 * commit no branch or tag of the sandbox's repository reaches, the asking run's own commit that could not be read, and
 * a cut named while the worker's worktree is there already, and a clone that is not one of the sandbox's own (the clone
 * round). No page draws them yet. The full English refusal names the commit, the folder, its branch and what git said,
 * or the clone and why it is not the sandbox's.
 */
export const WORKER_CUT_REFUSAL_CODES = {
  workerCutNotInTheSandbox: {},
  workerCutHeadUnread: {},
  workerCutWorktreeAlreadyThere: {},
  workerCloneNotOfTheSandbox: {},
} as const

/**
 * A seal that counts only its run's own commits (wave 13n): the three fields only the office writes (a run's
 * filing HEAD and end HEAD, and the commits a seal names as carried), a seal that would hold commits not the run's own,
 * a records seal that would leave the run's own commits out, and a working directory git cannot read at the seal or that
 * no longer holds the commit read at the run's filing. No page draws them yet. The full English refusal names each
 * commit by its full hash and subject, or the directory and what git said, and the write that finishes the run.
 */
export const SEAL_OWN_COMMITS_REFUSAL_CODES = {
  onlyTheOfficeWritesTheFilingHead: {},
  onlyTheOfficeWritesTheEndHead: {},
  onlyTheOfficeWritesTheCarriedCommits: {},
  sealHoldsCommitsNotTheRunsOwn: {},
  sealLeavesOutTheRunsOwnCommits: {},
  sealWorkingDirectoryUnread: {},
} as const

/**
 * The provider table's refusals, beside the Casting table (wave 13n, round CT): a body that is not the row's shape, a
 * row's id, name, programs, base address or key name broken, an id taken, changed or not found. No page draws them yet.
 * The English names the rule that was broken; an address refusal names the host and never a user:password@, and a key
 * name refusal never names a value.
 */
export const PROVIDER_TABLE_REFUSAL_CODES = {
  providerBodyNotAnObject: {},
  providerBodyHasOtherFields: { fields: 'string' },
  providerChangeNamesNothing: { id: 'string' },
  providerIdNotValid: {},
  providerIdTaken: { id: 'string' },
  providerIdChanged: { id: 'string' },
  providerNotFound: { id: 'string' },
  providerNameNotValid: { length: 'number' },
  providerProgramsNotAList: {},
  providerProgramNotKnown: { program: 'string' },
  providerProgramRepeated: { program: 'string' },
  providerAddressNotAnAddress: {},
  providerAddressNoHost: { scheme: 'string' },
  providerAddressHasCredentials: { host: 'string' },
  providerAddressScheme: { scheme: 'string' },
  providerAddressHttpNotLoopback: { host: 'string' },
  providerAddressHasQuery: { host: 'string' },
  providerAddressHasFragment: { host: 'string' },
  providerKeyNameNotValid: {},
  providerKeyNameKeptByTheOffice: { name: 'string' },
  providerPersonNotProved: {},
  providerNamedByACastingRow: { id: 'string', rows: 'string' },
  castingProviderRowNotFound: { provider: 'string' },
  castingProviderRowNoProgram: { provider: 'string' },
  castingProviderRowNotForTheProgram: { provider: 'string', program: 'string', programs: 'string' },
  castingProviderRowNotYet: { provider: 'string', program: 'string' },
  castingProviderRowOnlyForTheInspector: { provider: 'string', role: 'string' },
  dshProviderGone: { row: 'string', provider: 'string' },
  dshProviderNotForDsh: { row: 'string', provider: 'string', programs: 'string' },
  dshProviderKeyNotSet: { row: 'string', provider: 'string', entry: 'string' },
  dshProviderWhileTheRouterIsOn: { row: 'string', provider: 'string' },
  codexProviderGone: { row: 'string', provider: 'string' },
  codexProviderNotForCodex: { row: 'string', provider: 'string', programs: 'string' },
  codexProviderKeyNotSet: { row: 'string', provider: 'string', entry: 'string' },
  codexProviderWhileTheRouterIsOn: { row: 'string', provider: 'string' },
} as const

/**
 * A request whose Host header is not a name this office answers to on the listener that carried it (wave 13s, line
 * 13s). It is refused before every other request hook, and nothing is done. The port is the one the request's socket
 * came in on, which the words give with the office's loopback address. The Host itself is never repeated.
 */
export const HOST_REFUSAL_CODES = {
  hostIsNotThisOffice: { port: 'number' },
} as const

/**
 * A request that changes something and carries neither a header of the office's own nor JSON, which a website could
 * have sent (wave 13s, line 13s). It is refused before any door, and nothing is done. The words name nothing the
 * request said, so there are no values.
 */
export const OFFICES_MARK_REFUSAL_CODES = {
  writeWithoutTheOfficesMark: {},
} as const

/**
 * THE DECISIONS A DEPARTMENT RESTS ON (wave 13s, step 1b of departments and posts). Two refusals:
 * - a secretary taking a department away while it rests on a decision a department may no longer rest on. The full
 *   English names what is wrong with the decision and the way to take the department away: rest it on a decision that
 *   stands first;
 * - an act on a decision (delete, move, change of kind, of who decided it or of what it cites, or a revoke that puts
 *   one of those back) while a department, merged or not, rests on it. `resting` is the ids of every department and
 *   duties that rest on it, duties first; the full English names the door that changes each.
 *
 * EACH CODE IS NAMED ONCE, here, so the guard that throws it and the tests that read it cannot disagree about its
 * spelling. src/server/lib/grant/departments.ts, src/server/lib/grant/secretary-duties.ts and the tests import these
 * constants.
 */
export const DEPARTMENT_TAKEN_AWAY_ON_A_DECISION_IT_MAY_NOT_REST_ON = 'departmentTakenAwayOnADecisionItMayNotRestOn'
export const DEPARTMENTS_REST_ON_THE_DECISION = 'departmentsRestOnTheDecision'

export const DEPARTMENT_DECISION_REFUSAL_CODES = {
  [DEPARTMENT_TAKEN_AWAY_ON_A_DECISION_IT_MAY_NOT_REST_ON]: { department: 'string', decision: 'string' },
  [DEPARTMENTS_REST_ON_THE_DECISION]: { decision: 'string', resting: 'string' },
} as const

/**
 * WHAT A DECISION NAMES, at every decision door (src/server/lib/what-a-record-names.ts). A decision names the pages it
 * governs, or the whole project alone, or says in nothingFits that no page fits. The full English refusal says what to
 * send instead.
 */
export const DECISION_NAMES_REFUSAL_CODES = {
  decisionNamesNothingItGoverns: {},
  decisionGovernsIsEmpty: {},
  decisionGovernsNamesAPath: { path: 'string' },
  decisionGovernsTheWholeProjectBesideOthers: {},
  decisionNearestIsNotALivePage: { nearest: 'string' },
} as const

/**
 * A request that carries one half of a browser's device key and not the other (wave 13s, line 13s). Neither half alone
 * proves anything, so it is refused before every door but the pairing page's, and nothing is done. And a press that
 * would give a browser a key, sent by a page on another site: refused before a cookie is set or a half answered. And a
 * move of the old cookie that finds no key this office holds as the person's in it: nothing is moved.
 */
export const DEVICE_HALF_REFUSAL_CODES = {
  oneHalfOfADeviceKey: {},
  aPressFromAnotherSite: {},
  nothingToMove: {},
} as const

/**
 * A request whose Origin is not one of this office's own pages (wave 13s, line 13s). It is refused before any door, and
 * nothing is done. The words never repeat the Origin.
 */
export const ORIGIN_REFUSAL_CODES = {
  originIsNotThisOffice: {},
} as const

/**
 * The file tickets (wave 13s, line 13s): a ticket asked without both halves of a paired browser's device key, so none
 * is made, and a load whose ticket this office does not honour, so nothing is read or written.
 */
export const FILE_TICKET_REFUSAL_CODES = {
  fileTicketNeedsTwoHalves: {},
  fileTicketNotHonoured: {},
} as const

export const DEAD_LETTER_THRESHOLD_REFUSAL_CODES = {
  deadLetterThresholdsNotAllowed: {},
  deadLetterThresholdsBadValue: {},
  deadLetterThresholdsBadWarrant: {},
  deadLetterThresholdsBadDecision: {},
  deadLetterThresholdsNoInstallation: {},
} as const

export const REFUSAL_CODES = {
  agentTagsUnreadable: {},
  agentTagsNeedPerson: {},
  agentTagsNeedList: {},
  agentTagsBadTag: {},
  agentTagsBadName: {},
  agentTagsDuplicateName: {},
  agentTagsBadColour: {},
  agentTagsUnknownAgent: {},
  ...PRIVATE_LOGIN_REFUSAL_CODES,
  gateCountNotAllowed: {},
  gateCountUnknown: {},
  gateReadUnknown: { id: 'string' },
  gateCountAlreadyInServer: {},
  gateCountNobodyCounts: {},
  gateCountBadPosition: {},
  gateCountSpoolOnlyThePerson: {},
  gateCountSpoolBadBody: {},
  gateCountSpoolNoReason: {},
  gateCountSpoolNotRead: {},
  gateCountSpoolNotAnotherWorlds: { reason: 'string' },
  gateCountSpoolNotWhatYouSaw: { saw: 'string', now: 'string' },
  gateCountSpoolNotRemoved: { reason: 'string' },
  wordSettingRefused: { reason: 'string' },
  sidebarSettingRefused: { reason: 'string' },
  homeLayoutRefused: { reason: 'string' },
  sidebarPinsRefused: { reason: 'string' },
  reportCountRefused: { reason: 'string' },
  chapterEditRefused: { reason: 'string' },
  addedRoleRefused: { reason: 'string' },
  noticeRulesRefused: { reason: 'string' },
  runtimeSettingsBadValue: { reason: 'string' },
  runtimeSettingsReadOnly: { reason: 'string' },
  runtimeSettingsNotAllowed: { reason: 'string' },
  runtimeSettingsBadDecision: { reason: 'string' },
  runtimeSettingsBadWarrant: { reason: 'string' },
  officePauseNotReady: { reason: 'string' },
  officeRestartNotAllowed: { reason: 'string' },
  officeRestartBadGrant: { reason: 'string' },
  officeRestartBadWarrant: { reason: 'string' },
  officeRestartBadReason: { reason: 'string' },
  officeRestartNoManager: { reason: 'string' },
  ...DEAD_LETTER_THRESHOLD_REFUSAL_CODES,
  ...STORAGE_REFUSAL_CODES,
  ...ADDRESS_AND_RECORD_REFUSAL_CODES,
  ...UPGRADE_HISTORY_REFUSAL_CODES,
  ...BOOTSTRAP_STOP_REFUSAL_CODES,
  ...RECEIPT_REFUSAL_CODES,
  ...MACHINE_NAMES_REFUSAL_CODES,
  ...PACKAGE_WORKER_ASK_REFUSAL_CODES,
  ...DECISION_REPLACES_REFUSAL_CODES,
  ...CHINESE_HALF_REFUSAL_CODES,
  ...CASTING_REFUSAL_CODES,
  ...CASTING_CARDS_REFUSAL_CODES,
  ...EMBASSY_KEYS_REFUSAL_CODES,
  ...RAISE_UNTIL_REFUSAL_CODES,
  ...RAISE_END_REFUSAL_CODES,
  ...MESSAGE_CHANGE_REFUSAL_CODES,
  ...MESSAGE_QUOTE_POSITION_REFUSAL_CODES,
  ...AGENT_CONVERSATIONS_REFUSAL_CODES,
  ...PLAN_LINE_FACT_REFUSAL_CODES,
  ...PLAN_VERSION_REFUSAL_CODES,
  ...RESIDENT_REFUSAL_CODES,
  ...ANSWER_REFUSAL_CODES,
  ...DEAD_LETTER_SECRETARY_REFUSAL_CODES,
  ...MERGE_QUEUE_OWNER_REFUSAL_CODES,
  ...MODULE_REMINDER_SECRETARY_REFUSAL_CODES,
  ...REVIEW_ASK_REFUSAL_CODES,
  ...OWN_WORDS_REFUSAL_CODES,
  ...TERMINAL_REFUSAL_CODES,
  ...TERMINAL_GRANT_REFUSAL_CODES,
  ...TERMINAL_FOLDER_REFUSAL_CODES,
  ...REPORT_FILES_REFUSAL_CODES,
  ...REPORT_PDF_REFUSAL_CODES,
  ...HARNESS_REFUSAL_CODES,
  ...AGENT_TOOL_SETUP_REFUSAL_CODES,
  ...READINESS_REFUSAL_CODES,
  ...START_AT_LOGIN_REFUSAL_CODES,
  ...START_AT_LOGIN_BACKUP_REFUSAL_CODES,
  ...DATA_FOLDER_REFUSAL_CODES,
  ...MAIL_TOOL_REFUSAL_CODES,
  ...SENDER_READING_REFUSAL_CODES,
  ...SANDBOX_CAP_REFUSAL_CODES,
  ...TERMINAL_AGENT_REFUSAL_CODES,
  ...TERMINAL_AGENT_STILL_RUNS_REFUSAL_CODES,
  ...WAY_BACK_REFUSAL_CODES,
  ...AGENT_PANE_REFUSAL_CODES,
  ...AGENT_STEPS_REFUSAL_CODES,
  ...GOVERNS_REFUSAL_CODES,
  ...PLANNING_FLOW_REFUSAL_CODES,
  ...FLOW_STEP_REFUSAL_CODES,
  ...FLOW_WRITE_REFUSAL_CODES,
  ...SHUT_DOWN_REFUSAL_CODES,
  ...ENTERED_FLOW_REFUSAL_CODES,
  ...CHECKLIST_VERSION_REFUSAL_CODES,
  ...CHECKLIST_OWN_WORDS_REFUSAL_CODES,
  ...CHECK_ALSO_REFUSAL_CODES,
  ...KEPT_HERE_REFUSAL_CODES,
  ...VISIT_REFUSAL_CODES,
  ...IDENTITY_REFUSAL_CODES,
  ...CASTING_PROBABILITY_REFUSAL_CODES,
  ...CASTING_LABEL_REFUSAL_CODES,
  ...CASTING_SETTINGS_REFUSAL_CODES,
  ...QUICK_INPUT_REFUSAL_CODES,
  ...TERMINAL_HOLDER_RESTART_REFUSAL_CODES,
  ...MASTER_PIPELINE_REFUSAL_CODES,
  ...MAP_DICTIONARY_REFUSAL_CODES,
  ...TERMINAL_TYPED_FOR_ANOTHER_REFUSAL_CODES,
  ...TERMINAL_PREPARED_REFUSAL_CODES,
  ...WORKER_CUT_REFUSAL_CODES,
  ...PROVIDER_TABLE_REFUSAL_CODES,
  ...HOST_REFUSAL_CODES,
  ...OFFICES_MARK_REFUSAL_CODES,
  ...DEPARTMENT_DECISION_REFUSAL_CODES,
  ...DECISION_NAMES_REFUSAL_CODES,
  ...SEAL_OWN_COMMITS_REFUSAL_CODES,
  ...DEVICE_HALF_REFUSAL_CODES,
  ...ORIGIN_REFUSAL_CODES,
  ...FILE_TICKET_REFUSAL_CODES,
  ...CONVERSATION_EXPORT_REFUSAL_CODES,
} as const

export type AddressAndRecordRefusalCode = keyof typeof ADDRESS_AND_RECORD_REFUSAL_CODES
export type MachineNamesRefusalCode = keyof typeof MACHINE_NAMES_REFUSAL_CODES
export type PackageWorkerAskRefusalCode = keyof typeof PACKAGE_WORKER_ASK_REFUSAL_CODES
export type DecisionReplacesRefusalCode = keyof typeof DECISION_REPLACES_REFUSAL_CODES
export type ChineseHalfRefusalCode = keyof typeof CHINESE_HALF_REFUSAL_CODES
export type CastingRefusalCode = keyof typeof CASTING_REFUSAL_CODES
export type CastingCardsRefusalCode = keyof typeof CASTING_CARDS_REFUSAL_CODES
export type EmbassyKeysRefusalCode = keyof typeof EMBASSY_KEYS_REFUSAL_CODES
export type RaiseUntilRefusalCode = keyof typeof RAISE_UNTIL_REFUSAL_CODES
export type RaiseEndRefusalCode = keyof typeof RAISE_END_REFUSAL_CODES
export type MessageChangeRefusalCode = keyof typeof MESSAGE_CHANGE_REFUSAL_CODES
export type PlanLineFactRefusalCode = keyof typeof PLAN_LINE_FACT_REFUSAL_CODES
export type PlanVersionRefusalCode = keyof typeof PLAN_VERSION_REFUSAL_CODES
export type ResidentRefusalCode = keyof typeof RESIDENT_REFUSAL_CODES
export type AnswerRefusalCode = keyof typeof ANSWER_REFUSAL_CODES
export type DeadLetterSecretaryRefusalCode = keyof typeof DEAD_LETTER_SECRETARY_REFUSAL_CODES
export type MergeQueueOwnerRefusalCode = keyof typeof MERGE_QUEUE_OWNER_REFUSAL_CODES
export type ModuleReminderSecretaryRefusalCode = keyof typeof MODULE_REMINDER_SECRETARY_REFUSAL_CODES
export type ReviewAskRefusalCode = keyof typeof REVIEW_ASK_REFUSAL_CODES
export type OwnWordsRefusalCode = keyof typeof OWN_WORDS_REFUSAL_CODES
export type TerminalRefusalCode = keyof typeof TERMINAL_REFUSAL_CODES
export type TerminalGrantRefusalCode = keyof typeof TERMINAL_GRANT_REFUSAL_CODES
export type TerminalFolderRefusalCode = keyof typeof TERMINAL_FOLDER_REFUSAL_CODES
export type HarnessRefusalCode = keyof typeof HARNESS_REFUSAL_CODES
export type AgentToolSetupRefusalCode = keyof typeof AGENT_TOOL_SETUP_REFUSAL_CODES
export type ReadinessRefusalCode = keyof typeof READINESS_REFUSAL_CODES
export type StartAtLoginRefusalCode = keyof typeof START_AT_LOGIN_REFUSAL_CODES
export type StartAtLoginBackupRefusalCode = keyof typeof START_AT_LOGIN_BACKUP_REFUSAL_CODES
export type DataFolderRefusalCode = keyof typeof DATA_FOLDER_REFUSAL_CODES
export type MailToolRefusalCode = keyof typeof MAIL_TOOL_REFUSAL_CODES
export type SenderReadingRefusalCode = keyof typeof SENDER_READING_REFUSAL_CODES
export type SandboxCapRefusalCode = keyof typeof SANDBOX_CAP_REFUSAL_CODES
export type TerminalAgentRefusalCode = keyof typeof TERMINAL_AGENT_REFUSAL_CODES
export type TerminalAgentStillRunsRefusalCode = keyof typeof TERMINAL_AGENT_STILL_RUNS_REFUSAL_CODES
export type WayBackRefusalCode = keyof typeof WAY_BACK_REFUSAL_CODES
export type AgentPaneRefusalCode = keyof typeof AGENT_PANE_REFUSAL_CODES
export type AgentStepsRefusalCode = keyof typeof AGENT_STEPS_REFUSAL_CODES
export type GovernsRefusalCode = keyof typeof GOVERNS_REFUSAL_CODES
export type PlanningFlowRefusalCode = keyof typeof PLANNING_FLOW_REFUSAL_CODES
export type FlowStepRefusalCode = keyof typeof FLOW_STEP_REFUSAL_CODES
export type FlowWriteRefusalCode = keyof typeof FLOW_WRITE_REFUSAL_CODES
/** Every refusal of a write to a flow: the six of its steps and the seven of the Flows page's write doors. */
export type FlowRefusalCode = FlowStepRefusalCode | FlowWriteRefusalCode
export type ShutDownRefusalCode = keyof typeof SHUT_DOWN_REFUSAL_CODES
export type EnteredFlowRefusalCode = keyof typeof ENTERED_FLOW_REFUSAL_CODES
export type ChecklistVersionRefusalCode = keyof typeof CHECKLIST_VERSION_REFUSAL_CODES
export type CheckAlsoRefusalCode = keyof typeof CHECK_ALSO_REFUSAL_CODES
export type KeptHereRefusalCode = keyof typeof KEPT_HERE_REFUSAL_CODES
export type VisitRefusalCode = keyof typeof VISIT_REFUSAL_CODES
export type CastingProbabilityRefusalCode = keyof typeof CASTING_PROBABILITY_REFUSAL_CODES
export type CastingLabelRefusalCode = keyof typeof CASTING_LABEL_REFUSAL_CODES
export type CastingSettingsRefusalCode = keyof typeof CASTING_SETTINGS_REFUSAL_CODES
export type QuickInputRefusalCode = keyof typeof QUICK_INPUT_REFUSAL_CODES
export type TerminalHolderRestartRefusalCode = keyof typeof TERMINAL_HOLDER_RESTART_REFUSAL_CODES
export type MasterPipelineRefusalCode = keyof typeof MASTER_PIPELINE_REFUSAL_CODES
export type MapDictionaryRefusalCode = keyof typeof MAP_DICTIONARY_REFUSAL_CODES
export type TerminalTypedForAnotherRefusalCode = keyof typeof TERMINAL_TYPED_FOR_ANOTHER_REFUSAL_CODES
export type TerminalPreparedRefusalCode = keyof typeof TERMINAL_PREPARED_REFUSAL_CODES
export type WorkerCutRefusalCode = keyof typeof WORKER_CUT_REFUSAL_CODES
export type SealOwnCommitsRefusalCode = keyof typeof SEAL_OWN_COMMITS_REFUSAL_CODES
export type ProviderTableRefusalCode = keyof typeof PROVIDER_TABLE_REFUSAL_CODES
export type DepartmentDecisionRefusalCode = keyof typeof DEPARTMENT_DECISION_REFUSAL_CODES
export type DecisionNamesRefusalCode = keyof typeof DECISION_NAMES_REFUSAL_CODES
export type RefusalCode = keyof typeof REFUSAL_CODES
export type RefusalValues<C extends RefusalCode> = {
  readonly [K in keyof (typeof REFUSAL_CODES)[C]]: (typeof REFUSAL_CODES)[C][K] extends 'number'
    ? Extract<WordValues[string], number>
    : Extract<WordValues[string], string>
}
export type CodedRefusal = { [C in RefusalCode]: { code: C; values: RefusalValues<C> } }[RefusalCode]

/** Unknown codes or incomplete values keep the reply's original sentence on the page. */
export function readRefusal(code: unknown, values: unknown): CodedRefusal | null {
  if (typeof code !== 'string' || !Object.hasOwn(REFUSAL_CODES, code)) return null
  const expected = REFUSAL_CODES[code as RefusalCode]
  const sent = values === undefined ? {} : values
  if (typeof sent !== 'object' || sent === null || Array.isArray(sent)) return null
  const entries = Object.entries(sent)
  if (entries.length !== Object.keys(expected).length) return null
  for (const [key, type] of Object.entries(expected)) {
    if (!Object.hasOwn(sent, key)) return null
    const value = (sent as Record<string, unknown>)[key]
    if (typeof value !== type || (typeof value === 'number' && !Number.isFinite(value))) return null
  }
  return { code, values: sent } as CodedRefusal
}
