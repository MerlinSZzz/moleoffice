// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EARLIER DATA FOLDERS THE MOVE'S MARK NAMES, AND THE REFUSAL A STORED FILE READ GETS WHEN THE MARK CANNOT BE READ.
 *
 * `whereStoredFilesAreNow` in src/server/api/files.ts answers where a record's stored file is now. It reads the mark's
 * earlier data folders here, because the move's engine no longer answers them, and this module is small enough that
 * files.ts can import it without a cycle through the server's records.
 *
 * A MARK THAT CANNOT BE READ IS NOT A MARK THAT NAMES NO EARLIER FOLDER. The two answers have different shapes, so no
 * caller can take the unreadable one for an empty list.
 */

import { readTheMoveMark, theMoveMarkPath } from '../../config/the-data-folder-move.mjs'
import type { CodedRefusal } from '../../shared/refusal-codes.ts'
import { PanelError } from './panel-error.ts'

/** Why the earlier data folders are not known: the mark cannot be read, at this path, for this reason. */
export interface TheEarlierDataFoldersCannotBeKnown {
  state: 'unreadable'
  /** The mark's path. */
  mark: string
  /** Why the mark cannot be read. */
  why: string
}

/**
 * THE EARLIER DATA FOLDERS THE MARK NAMES: its list, none when there is no mark, or the reason they cannot be known
 * when the mark cannot be read.
 * @param markPath where the move's mark is
 */
export function theEarlierDataFoldersOfTheMark(markPath: string = theMoveMarkPath()): readonly string[] | TheEarlierDataFoldersCannotBeKnown {
  const read = readTheMoveMark(markPath)
  if (read.state === 'absent') return []
  if (read.state === 'unreadable') return { state: 'unreadable', mark: markPath, why: read.why }
  return [...read.mark.earlier]
}

/**
 * WHY A STORED FILE OUTSIDE THE DATA FOLDER IN USE CANNOT BE PLACED while the move's mark cannot be read: the mark
 * cannot be read and why, so the earlier data folders are not known, and nothing was read or changed.
 * @param mark the mark's path
 * @param why why the mark cannot be read
 */
export function theStoredFilesNeedTheMarkWords(mark: string, why: string): string {
  return (
    `The data folder move's mark at ${mark} cannot be read, because ${why}, so the earlier data folders are not ` +
    'known. A stored file outside the data folder in use cannot be placed. Nothing was read or changed.'
  )
}

/**
 * THE REFUSAL OF A STORED FILE OUTSIDE THE DATA FOLDER IN USE while the move's mark cannot be read, with the code the
 * page draws and the mark and reason it names.
 * @param mark the mark's path
 * @param why why the mark cannot be read
 */
export function theStoredFileNeedsTheMarkRefusal(mark: string, why: string): PanelError {
  const refusal: CodedRefusal = { code: 'dataFolderMarkUnreadable', values: { mark, why } }
  return new PanelError(theStoredFilesNeedTheMarkWords(mark, why), 503, undefined, undefined, undefined, refusal)
}
