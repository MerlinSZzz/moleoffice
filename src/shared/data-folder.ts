// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE DATA FOLDER DOORS ANSWER ON THE WIRE, read by the server and the page alike. Criteria DF19 to DF21.
 *
 * GET /api/office/data-folder answers a reading; POST /api/office/data-folder/move answers what was started; and
 * POST /api/office/data-folder/confirm answers what was removed and what was kept. src/server/api/data-folder.ts
 * builds the three answers and the Settings panel's Data folder panel draws them. The move and its mark are
 * described in src/config/the-data-folder-move.mjs; the shapes here are the one place they are written for the wire.
 */

/** What a move is doing, as the mark says it. */
export type TheStateOfAMove =
  | 'stopping'
  | 'copying'
  | 'checking'
  | 'switching'
  | 'switched'
  | 'started'
  | 'confirmed'
  | 'stopped-before-the-switch'
  | 'switched-back'

/** The mark a move writes beside the `.env`: the old folder, the new one, the state, the mover and the earlier folders. */
export interface TheMoveMark {
  version: number
  /** The data folder the move copies from. */
  from: string
  /** The place the move copies to. */
  to: string
  /** The database file's name inside both folders. */
  database: string
  state: TheStateOfAMove
  /** The process doing the move, and when it started, so a start can tell it from a process given the same number later. */
  mover: { pid: number; startedAt: string }
  /** The data folders an earlier confirm left behind. */
  earlier: string[]
  /** Each name in the old folder with its SHA-256, once the copy has been listed. */
  manifest: Record<string, string> | null
  /** One sentence about the step the mark is at, or null. */
  says: string | null
  /** When the mark was written, in local time. */
  at: string
}

/**
 * THE MARK AS THE READING GIVES IT. An absent mark and a mark that cannot be read are not the same answer: a broken
 * file might be guarding a move. A mark that can be read also says whether the process it names is still the mover.
 */
export type TheMarkInTheReading =
  | { state: 'absent' }
  | { state: 'unreadable'; why: string }
  | { state: 'read'; mark: TheMoveMark; moverAlive: boolean }

/** Which of the three chose the data folder. */
export type WhoChoseTheDataFolder = 'the process environment' | 'the .env line' | 'the default'

/** Where the office keeps its data, the mark, and whether this caller may press. */
export interface DataFolderReading {
  /** The folder the database is in. */
  folder: string
  /** The database file's name inside that folder. */
  database: string
  chosenBy: WhoChoseTheDataFolder
  /** The same fact in the sentence the `data-folder where` command prints on its second line. */
  chosenBySays: string
  /** Whether this office runs from an installed bundle, so a move from Settings is allowed at all. */
  fromABundle: boolean
  mark: TheMarkInTheReading
  /** Whether this caller is the person, rather than a secretary pressing under their grant. */
  theCallerIsThePerson: boolean
  /** Whether this caller may press the move, by the press's own check. */
  mayMove: boolean
  /** Whether this caller may press the confirm, by the press's own check. */
  mayConfirm: boolean
  /** With `?to=`: whether a move to that place would be refused, and the sentence why, or null when it would go on. */
  wouldRefuse?: { to: string; why: string | null }
}

/** What the move press answers once the mark names the mover alive. */
export interface DataFolderMoveStarted {
  /** The process doing the move. */
  mover: { pid: number }
  /** The mark the door read. */
  mark: TheMoveMark
  /** Where the mover writes its own output, beside the mark. */
  logPath: string
  /** One sentence saying the office stops now and the panel asks again until it answers. */
  says: string
}

/** What the confirm press did. */
export interface DataFolderConfirmed {
  /** The names in the old folder it removed because their bytes still matched the copy. */
  removed: string[]
  /** The names it kept, because they were added or changed, or could not be read or removed. A folder that could not be read or removed is named with a `/` at the end. */
  kept: string[]
  /** One sentence about the two lists. */
  says: string
}
