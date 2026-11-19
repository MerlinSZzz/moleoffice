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
