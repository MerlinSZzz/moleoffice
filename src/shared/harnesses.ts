// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHAPES OF THE AGENT TOOLS LIST, shared by the server (src/server/lib/harnesses.ts, which works each one out)
 * and the panel on Terminal management (src/web/components/InstallHarnesses.tsx, which draws it). Wave 13u, round 3.
 */

/** Why a harness has no install command, as a code the page draws in its own language. */
export type NoInstallCode = 'vendorArchivedIt' | 'installedSeparately'

/** The newest version its vendor publishes, or why it could not be read. `from` is the address asked. */
export type NewestVersion =
  | { read: true; version: string; from: string; readAt: string }
  | { read: false; version: null; from: string; why: string; readAt: string }

/** Why it is not known whether a newer version exists. */
export type NewerUnknownCode = 'notInstalled' | 'installedUnread' | 'newestUnread' | 'notAVersion' | 'cannotCompare'

/** Whether a newer version than the installed one exists: 'yes' only when both were read and compare. */
export type Newer = { answer: 'yes' | 'no' } | { answer: 'unknown'; why: NewerUnknownCode }

/** Where a program is, and the version it says it is, or the sentence saying why none could be read. */
export interface ProgramVersion {
  path: string | null
  version: string
  versionWasRead: boolean
}

/**
 * One agent tool as the office declares it, with nothing asked of a program or a registry. GET /api/harnesses?part=list
 * answers these at once, so the Terminals page draws its rows before the versions arrive.
 */
export interface HarnessListing {
  id: string
  name: string
  program: string
  /** Its vendor's own install command for macOS and Linux, the page that states it, and the day it was read there. */
  install: { command: string; source: string; read: string } | null
  noInstall: { code: NoInstallCode; says: string } | null
}

/** One agent tool's versions, read now or answered from kept reads. */
export interface HarnessReading extends HarnessListing {
  /** Where the program is on the PATH the office's terminals get, and what it says its version is. */
  installed: ProgramVersion
  newest: NewestVersion
  newer: Newer
  /**
   * The parts answered from a read kept past its time and being read again behind this answer.
   * Each time is when the read shown was made (ISO). Null means read now or kept within its time.
   */
  beingReadAgain: { installed: string | null; newest: string | null }
}

/** Why it is not known whether an agent tool is signed in. */
export type SignedInUnreadCode = 'notInstalled' | 'noStatusCommand' | 'didNotRun' | 'notUnderstood'

/**
 * WHETHER AN AGENT TOOL IS SIGNED IN, as its own status command says on the environment the office's terminals get
 * (src/server/lib/setting-up-an-agent-tool.ts). `asked` is the command run, in words; what the tool printed is never
 * answered. 'notReadable' says why nothing could be read, and is never a guess at yes or no.
 */
export type SignedIn =
  | { answer: 'yes' | 'no'; asked: string }
  | { answer: 'notReadable'; why: SignedInUnreadCode; asked: string | null }

/** Why the Set up press went to the secretary it went to (src/server/lib/the-set-up-press.ts). */
export type WhyThisSecretary = 'holdsTheDuty' | 'theOnlySecretary' | 'writtenToLast' | 'registeredFirst'

/** The Set up press's answer: the tool, the secretary the person's message went to, why that one, and the message's id. */
export interface TheSetUpSent {
  harness: string
  secretary: { id: string; name: string }
  why: WhyThisSecretary
  message: string
}

/** Why a page may open no address for an account sign-in. */
export type NoSignInAddressCode = 'printedNone' | 'notAnAddress' | 'notHttps' | 'hasAUser' | 'hasAPort' | 'anotherHost'

/**
 * WHAT THE SIGN-IN DOOR ANSWERS, POST /api/harnesses/:id/sign-in (src/server/lib/setting-up-an-agent-tool.ts).
 * `id` names the sign-in this press started, and the code door takes it. `address` is the one address a page may open,
 * worked out on the server: a tool's declared device page, or the address it printed when that passed the check. When
 * there is none, `noAddress` says why, in a code and one English sentence. `code` is the device code the tool printed, as
 * text, or null. `takesACode` says the sign-in waits for the code the sign-in page shows the person, given at
 * POST /api/harnesses/:id/sign-in/code. `aSecondTabMayOpen` says the tool may open the system's browser itself as well,
 * where the office does not know its browser to be stopped.
 */
export interface SignInStarted {
  harness: string
  id: string
  address: string | null
  noAddress: { code: NoSignInAddressCode; says: string } | null
  code: string | null
  takesACode: boolean
  aSecondTabMayOpen: boolean
  started: string
  already: boolean
}

/** What the code door answers, POST /api/harnesses/:id/sign-in/code. The code itself is never answered. */
export interface SignInCodeGiven {
  harness: string
  signIn: string
  codeGiven: true
}
