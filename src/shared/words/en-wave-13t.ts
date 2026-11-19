// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The English list's place for wave 13t's new words, in English only. Their Chinese is written in
// the translation round before a version, and until then a Chinese page shows the English. joined.ts reads this file.
import type { DataFolderRefusalCode, MailToolRefusalCode, MergeQueueOwnerRefusalCode, SenderReadingRefusalCode, StartAtLoginBackupRefusalCode } from '../refusal-codes.ts'
import { SURFACES } from '../surfaces.ts'
export const enWave13t = {
  "record.section.movedFirst": "Moved first",
  // ---- who owns the merge queue: src/server/lib/merge-queue-owner.ts and src/web/components/MergeQueueOwner.tsx ----
  // {who} is an agent's name and is never translated.
  get 'settingsPanel.title.mergequeueowner'(): string { return SURFACES['settings.mergequeueowner'] },
  'mergeQueueOwner.loading': 'the merge queue\'s owner',
  'mergeQueueOwner.allows': 'The agent that may move a merge entry to the front of its lane.',
  'mergeQueueOwner.named': '{who} owns the merge queue.',
  'mergeQueueOwner.nobody.nobodyChose': 'No owner named. Only you may move an entry to the front.',
  'mergeQueueOwner.nobody.notRegistered': 'The merge queue has no owner. The agent named for it, {who}, is not registered here, so only you may move an entry to the front.',
  'mergeQueueOwner.nobody.retired': 'The merge queue has no owner. The agent named for it, {who}, is retired, so only you may move an entry to the front.',
  'mergeQueueOwner.nobody.notASecretary': 'No owner: {who} is not a secretary. Only you may move an entry to the front.',
  'mergeQueueOwner.pick': 'Secretary',
  'mergeQueueOwner.pickNobody': 'None',
  'mergeQueueOwner.save': 'Name this secretary',
  'mergeQueueOwner.nobodyQualifies': 'No registered secretary to name.',
  // The door's refusals, which the panel draws in the page's language.
  ...{
    'server.mergeQueueOwnerOwnerNotProved': 'This request does not prove that it came from the owner. Only the owner names who owns the merge queue. Nothing was changed.',
    'server.mergeQueueOwnerNoSuchAgent': 'No agent here answers to that name, so it cannot own the merge queue. Nothing was changed.',
    'server.mergeQueueOwnerNotRegistered': 'That agent is not registered here, so it cannot own the merge queue. Nothing was changed.',
    'server.mergeQueueOwnerRetired': 'That agent is retired, so it cannot own the merge queue. Nothing was changed.',
    'server.mergeQueueOwnerNotASecretary': 'That agent is not a secretary, so it cannot own the merge queue. Nothing was changed.',
    'server.mergeQueueOwnerUnreadable': 'Who owns the merge queue is stored in a form this office cannot read. Nothing was guessed and nothing was changed.',
    'server.mergeQueueOwnerNoInstallationRow': 'This office has no row for its own settings, so who owns the merge queue could not be stored. Nothing was changed.',
  } satisfies Record<`server.${MergeQueueOwnerRefusalCode}`, string>,
  // ---- the menu the Settings page names, by system: src/web/components/ShutDown.tsx (round W32) ----
  'shutDown.windowOnly.trayMenuBar': 'The Shut down item in the menu bar always shuts Mole Office down.',
  'shutDown.windowOnly.trayNotificationArea': 'The Shut down item in the notification area always shuts Mole Office down.',
  // ---- start at sign-in on Windows: src/web/components/StartAtLogin.tsx (the decision of 31 October 2026) ----
  'startAtLogin.windows.where': 'On Windows, turn this on or off with "Open at login" in the menu of the Mole Office icon, in the notification area at the right of the taskbar.',
  'startAtLogin.windows.signOut': 'Signing out of Windows stops the office. When this is on, the office starts again when you next sign in, not when the computer is switched on.',
  // The press's refusals when its old unit cannot be backed up, or the new unit cannot be written (round W26), when
  // the file beside a first unit is left or a file stands where a folder of the unit goes (round W28), and when the
  // file beside a unit that was kept is left, alone or with the copy (round W29).
  ...{
    'server.startAtLoginNotBackedUp': 'The unit the office wrote before could not be copied to {path}, so it was not written again. Nothing was changed.',
    'server.startAtLoginNotWritten': 'The unit could not be written to {path}, so it was left as it was. Nothing was changed.',
    'server.startAtLoginCopyLeft': 'The unit could not be written, so it was left as it was. The copy of it this press made could not be removed, and is still at {path}.',
    'server.startAtLoginUnitKeptFileLeft': 'The unit could not be written, so it was left as it was. The file this press wrote beside it could not be removed, and is still at {path}.',
    'server.startAtLoginCopyAndFileLeft': 'The unit could not be written, so it was left as it was. The copy of it this press made could not be removed, and is still at {path}. The file this press wrote beside it could not be removed either, and is still at {beside}.',
    'server.startAtLoginFileLeft': 'The unit could not be written, so there is still no unit. The file this press wrote beside it could not be removed, and is still at {path}.',
    'server.startAtLoginUnderAFile': '{path} is a file, not a folder, so the unit cannot be read or written. Nothing was changed. Move that file aside, and try again.',
  } satisfies Record<`server.${StartAtLoginBackupRefusalCode}`, string>,
  // ---- the data folder panel: src/web/components/DataFolderPanel.tsx (criteria DF18 and DF22) ----
  // {folder}, {from}, {to}, {step} and {state} are paths, a step and a state, drawn as they come and never translated.
  get 'settingsPanel.title.datafolder'(): string { return SURFACES['settings.datafolder'] },
  'dataFolder.loading': 'where the office keeps its data',
  'dataFolder.unread': 'Where the office keeps its data could not be read.',
  'dataFolder.where': 'The office keeps its data in {folder}.',
  'dataFolder.chosenBy.default': 'This is the office\'s own folder, the one it uses when nothing names another.',
  'dataFolder.chosenBy.envLine': 'The office\'s settings file names this folder.',
  'dataFolder.chosenBy.processEnvironment': 'The way this office was started names this folder, so it is not moved from here.',
  'dataFolder.notABundle': 'This office runs from its source code, not from an install, so its data folder is not moved from here.',
  'dataFolder.mark.absent': 'No move of the data folder is recorded.',
  'dataFolder.mark.unreadable': 'The note the last move left cannot be read, so the office cannot tell whether a move is running. Until the note is removed, no move starts, and the office does not start again after it stops.',
  'dataFolder.mark.moving': 'The data folder is being moved from {from} to {to}.',
  'dataFolder.mark.didNotFinish': 'A move from {from} to {to} ended before it finished. Its last step was this: {step}',
  'dataFolder.mark.started': 'The data folder was moved from {from} to {to}. The old folder is kept until you confirm that the office works from the new one.',
  'dataFolder.mark.confirmed': 'The data folder was moved from {from} to {to}, and the copied files were removed from the old folder.',
  'dataFolder.mark.stoppedBeforeTheSwitch': 'A move to {to} stopped before the office was switched to it, so the office still uses {from}.',
  'dataFolder.mark.switchedBack': 'The office did not start from {to}, so the move tried to switch it back to {from}. Both folders are kept.',
  'dataFolder.mark.switchedAndEnded': 'The move switched the office from {from} to {to}, and its mover ended before it saw the office start. The office runs from {folder} now. The confirm ends the move when the office runs from {to}.',
  'dataFolder.mark.unknownState': 'The note the last move left says {state}, which this page does not know.',
  'dataFolder.step.stopping': 'Stopping the office.',
  'dataFolder.step.copying': 'Copying the files.',
  'dataFolder.step.checking': 'Checking the copy.',
  'dataFolder.step.switching': 'Switching the office to the new folder.',
  'dataFolder.step.switched': 'Starting the office from the new folder.',
  'dataFolder.earlier': 'Earlier data folders, still on this computer:',
  'dataFolder.to': 'New folder',
  'dataFolder.toHint': 'A full path. The folder must be empty, or not exist yet inside a folder that does.',
  'dataFolder.check': 'Check this folder',
  'dataFolder.check.fine': 'A move to {to} would go ahead.',
  'dataFolder.check.refused': 'A move to {to} would be refused:',
  'dataFolder.move': 'Move the data folder',
  'dataFolder.move.warn': 'The office stops while the files are copied and checked, and then starts again from the new folder. No agent can work while it is stopped. The old folder is kept until you confirm.',
  'dataFolder.move.sure': 'Stop the office and move',
  'dataFolder.move.cancel': 'Cancel',
  'dataFolder.waiting': 'The office is stopped while the data folder is moved. This panel asks it again every two seconds until it answers.',
  'dataFolder.waiting.asked': { one: 'Asked {n} time with no answer so far.', other: 'Asked {n} times with no answer so far.' },
  'dataFolder.waiting.otherIdentity': 'An office answers again, but under another identity than the office this page was opened against. A move gives the office a new identity, because its identity is made from the place of its database. This page reads only the office it was opened against, so load the page again to read the office as it is now.',
  'dataFolder.loadAgain': 'Load the page again',
  'dataFolder.confirm.what': 'Removing the old copy removes from {from} only the files that are the same as their copies. Anything changed or added there is kept.',
  'dataFolder.confirm': 'Remove the old copy',
  'dataFolder.confirmFirst': 'A new move can start once the old copy is removed.',
  'dataFolder.confirmed.removed': { one: 'Removed {n} file from the old folder.', other: 'Removed {n} files from the old folder.' },
  'dataFolder.confirmed.kept': 'Kept, because they changed, were added, or could not be read or removed:',
  'dataFolder.onlyThePerson': 'Only you press this, or a secretary where your grant allows it.',
  'dataFolder.throughTheDoor': 'A secretary holding the person\'s grant presses these through the door, with its reason, because this panel takes no reason.',
  'dataFolder.notChanged': 'Nothing was changed.',
  'dataFolder.busy': 'Waiting for the office to answer the last press.',
  // ---- the data folder door's refusals: src/server/api/data-folder.ts (criteria DF18 to DF21) ----
  // {runs} is the handles of the agent runs at work; {why} is the mover's own check's sentence; {log} is the end of the
  // mover's log; {group} is its process group.
  ...{
    'server.dataFolderOnlyThePerson': 'Only the person may move the office\'s data folder or confirm a move, or a secretary holding the person\'s grant where this office\'s list of what the grant carries says so. Nothing was started or changed.',
    'server.dataFolderTestWorld': 'This Mole Office is a test world. A data folder move here would stop the office the world runs from, and the confirm would remove files in a folder that is deleted with the world. Nothing was started and nothing was changed. Press it on the office itself.',
    'server.dataFolderNoWayToStart': 'This server was not given a way to start the data folder mover, so no move was started and nothing was changed.',
    'server.dataFolderNotABundle': 'This office runs from a checkout, and a checkout\'s data folder is not moved from Settings. Nothing was started and nothing was changed.',
    'server.dataFolderRunsAtWork': 'The move stops the office for as long as the copy takes, and these agent runs are at work: {runs}. Nothing was started and nothing was changed. Wait until they have finished.',
    'server.dataFolderMoveStarting': 'A data folder move is already starting in this server, so this press started nothing and nothing was changed. Wait for the move to be seen at work, or for this server to say it was not.',
    'server.dataFolderMoveRefused': '{why}',
    'server.dataFolderMoverEnded': 'The data folder mover ended before this door saw it at work, so no move was seen to start. Its log ends: {log}',
    'server.dataFolderMoverNotSeen': 'The data folder mover started as process group {group} and wrote no mark this door could see at work. Its log is {log}. The mover is registered in the process ledger, and this door did not stop it.',
    'server.dataFolderNothingToConfirm': '{why}',
    'server.dataFolderNotUnderTheGrant': '{why}',
    'server.dataFolderMarkUnreadable': 'The data folder move\'s mark at {mark} cannot be read, because {why}, so the earlier data folders are not known. A stored file outside the data folder in use cannot be placed. Nothing was read or changed.',
  } satisfies Record<`server.${DataFolderRefusalCode}`, string>,
  // The mail tool's press and its turn-off, when a file stands where a folder of its service goes (round W28).
  ...{
    'server.mailToolUnderAFile': '{path} is a file, not a folder, so the mail tool\'s service cannot be read or written. Nothing was changed. Move that file aside, and press again.',
  } satisfies Record<`server.${MailToolRefusalCode}`, string>,
  // Inside the installed Windows app, when the operating system did not say in time which program sent a request, and
  // the window's first page, which asks again. {seconds} is how long it was waited for; {times} how many times the
  // window asked in all.
  ...{
    'server.senderNotReadInTime': 'This request was refused, and nothing was done. The operating system did not say within {seconds} seconds which program on this computer sent it, so Mole Office does not know who sent it. Send the request again.',
  } satisfies Record<`server.${SenderReadingRefusalCode}`, string>,
  'start.waitingForWindows': "Waiting for the operating system. It has not yet said which program on this computer sent this window's first requests, so the window asks again by itself.",
  'start.windowsDidNotSay': "Mole Office did not open, and nothing was done. The window asked {times} times, and each time the operating system did not say within {seconds} seconds which program on this computer sent the window's requests. To try again, choose Reload in the View menu at the top of this window.",
} as const
