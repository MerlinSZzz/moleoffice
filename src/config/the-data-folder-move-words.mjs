// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// THE ENGLISH OF EACH REFUSAL OF THE DATA FOLDER MOVE, written once and keyed by its refusal code. The move's check,
// its walk and its confirm refuse with a code and its values (src/config/the-data-folder-move.mjs). The mover and the
// service command say the English filled in here. The word lists read their `server.<code>` words from here
// (src/shared/words/en-wave-13t.ts), and the page draws the code in its own language. A name in braces is a value.
// A refusal whose sentence the mover picks from several has a code for each sentence, so no picked words are a value.
// THIS FILE IMPORTS NOTHING, so the word lists read it without loading the mover.
export const THE_DATA_FOLDER_MOVE_WORDS = {
  dataFolderPlaceNotAFullPathFromSlash:
    'The place {place} is not a full path written the way this system writes one (starting with /, such as {example}), so the move was refused and nothing was changed.',
  dataFolderPlaceNotAFullPathOnWindows:
    'The place {place} is not a full path written the way this system writes one (such as {example}), so the move was refused and nothing was changed.',
  dataFolderPlaceNotEmpty: 'The place {to} is there and is not an empty folder, so the move was refused and nothing was changed.',
  dataFolderPlaceIsTheDataFolder: 'The place {to} is the data folder, so the move was refused and nothing was changed.',
  dataFolderPlaceInsideTheDataFolder: 'The place {to} is inside the data folder {from}, so the move was refused and nothing was changed.',
  dataFolderPlaceHoldsTheDataFolder: 'The place {to} holds the data folder {from}, so the move was refused and nothing was changed.',
  dataFolderPlaceInTheInstallFolder:
    'The place {to} is inside the install folder {installFolder}, which an update deletes, so the move was refused and nothing was changed.',
  dataFolderPlaceHasNoFolder: 'The folder that would hold {to} does not exist, so the move was refused and nothing was changed.',
  dataFolderPlaceHasTooLittleRoom:
    'The drive of {to} has {freeBytes} free bytes and the data folder holds {folderBytes} bytes, so the move was refused and nothing was changed.',
  dataFolderProcessEnvironmentDecides:
    'MOLE_OFFICE_DB is set by the process environment, so a .env line would not decide where the data folder is; the move was refused and nothing was changed.',
  dataFolderMoveStillRunning:
    'A data folder move is still running: the mark {mark} says {state} and the process {pid} that is moving the data folder from {from} to {to} is still alive, so the move was refused and nothing was changed.',
  dataFolderMoveNotConfirmed:
    'A data folder move switched the office to {to} and has not been confirmed: the mark {mark} says {state}, so the move was refused and nothing was changed.',
  dataFolderMoveRunningUnknown:
    'The data folder move mark {mark} cannot be read ({why}), so whether a move is running is not known; remove it when no move is running.',
  dataFolderPlaceInTheTemporaryFolder:
    "The place {to} is in this user's temporary folder {folder}, which {variable} names; Disk Cleanup and Storage Sense delete files there, so the move was refused and nothing was changed.",
  dataFolderPlaceIsANetworkPath:
    "The place {to} is a network path. The office's database keeps a write-ahead log, which does not work on a network share, so the move was refused and nothing was changed.",
  dataFolderPlaceOnANetworkDrive:
    "The place {to} is on {drive}, which Windows reports as a network drive. The office's database keeps a write-ahead log, which does not work on a network share, so the move was refused and nothing was changed.",
  dataFolderDriveNotRead:
    "The place {to} is on {drive}, and Windows could not tell what kind of drive that is ({why}). It may be a network drive, where the office's database cannot keep its write-ahead log, so the move was refused and nothing was changed.",
  dataFolderDriveTypeUnknown:
    "The place {to} is on {drive}, and Windows could not tell what kind of drive that is (Windows answered {type}). It may be a network drive, where the office's database cannot keep its write-ahead log, so the move was refused and nothing was changed.",
  dataFolderDriveNotAsked:
    "The place {to} is on {drive}, and Windows could not tell what kind of drive that is (nobody asked Windows). It may be a network drive, where the office's database cannot keep its write-ahead log, so the move was refused and nothing was changed.",
  dataFolderLoginUnitNotOurs:
    'A login unit that Mole Office did not write is at {unit}. An office it starts after the move may open the database in the old folder, so the move was refused and nothing was changed. Settings does not remove a unit Mole Office did not write: remove that file, and then move the data folder.',
  dataFolderLoginUnitNotOursRuns:
    'A login unit that Mole Office did not write is at {unit}. An office it starts after the move may open the database in the old folder, so the move was refused and nothing was changed. Settings does not remove a unit Mole Office did not write. That unit runs now, so remove that file, then start the computer again and open Mole Office, because the window then starts the office without the unit; then move the data folder.',
  dataFolderLoginUnitInAnAppImage:
    'The login unit {unit} names the database it opens, so an office it starts after the move would open the database in the old folder. The move was refused and nothing was changed. Turn start at login off in Settings, which removes the unit, and then move the data folder.',
  dataFolderLoginUnitStartsAtLogin:
    'Start at login is on. The login unit {unit} names the database it opens, so an office it starts after the move would open the database in the old folder. The move was refused and nothing was changed. Turn start at login off in Settings, move the data folder, and then turn start at login on again, which writes the unit for the new folder.',
  dataFolderLoginUnitStartsAtLoginRuns:
    'Start at login is on. The login unit {unit} names the database it opens, so an office it starts after the move would open the database in the old folder. The move was refused and nothing was changed. The office runs from that unit now, so turn start at login off in Settings, then start the computer again and open Mole Office, because the window then starts the office without the unit; then move the data folder, and turn start at login on again, which writes the unit for the new folder.',
  dataFolderLoginUnitMayStartAtLogin:
    'systemd does not say that start at login is off. The login unit {unit} names the database it opens, so an office it starts after the move would open the database in the old folder. The move was refused and nothing was changed. Turn start at login off in Settings, move the data folder, and then turn start at login on again, which writes the unit for the new folder.',
  dataFolderLoginUnitMayStartAtLoginRuns:
    'systemd does not say that start at login is off. The login unit {unit} names the database it opens, so an office it starts after the move would open the database in the old folder. The move was refused and nothing was changed. The office runs from that unit now, so turn start at login off in Settings, then start the computer again and open Mole Office, because the window then starts the office without the unit; then move the data folder, and turn start at login on again, which writes the unit for the new folder.',
  dataFolderLoginUnitRuns:
    'The login unit {unit} names the database it opens, so an office it starts after the move would open the database in the old folder. The move was refused and nothing was changed. The office runs from that unit now, so turn start at login off in Settings, then start the computer again and open Mole Office, because the window then starts the office without the unit; then move the data folder, and turn start at login on again, which writes the unit for the new folder.',
  // A UNIT SYSTEMD SAYS IS OFF AND THAT DOES NOT RUN starts no office, so the check lets it through and never says this.
  dataFolderLoginUnitOff:
    'The login unit {unit} names the database it opens, so an office it starts after the move would open the database in the old folder. The move was refused and nothing was changed. Turn start at login off in Settings, move the data folder, and then turn start at login on again, which writes the unit for the new folder.',
  dataFolderWalkMetASymbolicLink:
    'The data folder {folder} holds the symbolic link {name} ({path}), so it cannot be moved whole and nothing was changed.',
  dataFolderWalkMetASpecialFile:
    'The data folder {folder} holds {name}, which is not an ordinary file or a folder, so it cannot be moved whole and nothing was changed.',
  dataFolderWalkMetMoreNames:
    'The file {path} has {links} names and the walk met {found} of them inside the folder, so the folder cannot be moved whole and nothing was changed.',
  // THE WALK MET AN ERROR OF THE SYSTEM, such as a folder it may not read. Its words are the system's own, as they came.
  dataFolderMoveRefused: '{why}',
  dataFolderConfirmNeedsAStartedMove:
    'The old data folder can be removed only after the move is confirmed, and the mark {mark} says {state} rather than started, so nothing was removed.',
  dataFolderConfirmCannotReadTheOldFolder:
    'The old data folder {from} cannot be read, so nothing was removed and the move recorded in {mark} is not confirmed: {why}',
  dataFolderConfirmNeedsTheNewDatabase: 'The mark {mark} moved the data folder to {wanted}, and the office in use names {inUse}, so nothing was removed.',
  dataFolderConfirmWaitsForTheMover:
    'The data folder move recorded in {mark} says switched and the process {pid} that is moving the data folder is still running, so it may still switch the office back; nothing was removed, and the confirm can be pressed again once that process has ended.',
  dataFolderNoMoveToConfirm: 'There is no data folder move mark at {mark}, so there is no old data folder to remove and nothing was removed.',
}

/**
 * A template with its values filled in, as the page fills an English word: each `{name}` with a value of its own
 * becomes that value as a string, in one pass, and a place with no value stays as it is written.
 * @param {string} template
 * @param {Readonly<Record<string, string | number>>} [values]
 * @returns {string}
 */
export function filledIn(template, values) {
  return template.replace(/\{(\w+)\}/g, (mark, name) => (values !== undefined && Object.hasOwn(values, name) ? String(values[name]) : mark))
}
