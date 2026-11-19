// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The English list's place for wave 13n's new words, in English only. Their Chinese is written in
// the translation round before a version, and until then a Chinese page shows the English. joined.ts reads this file.
import type {
  CastingSettingsRefusalCode,
  PackageWorkerAskRefusalCode,
  ProviderTableRefusalCode,
} from '../refusal-codes.ts'

import { SURFACES } from '../surfaces.ts'
import { NOTICE_WORDS } from '../../config/word-sources.mjs'

/** tests/coded-refusals-keep-the-server-english.test.ts reads every server.<code> in this file as the server's own sentence. */
export const THE_WORDS_ARE_THE_SERVERS_SENTENCE = true

export const enWave13n = {
  'casting.native': 'Native fields',
  'casting.nativeModel': 'Native model',
  'casting.nativeProvider': 'Native provider',
  'casting.nativeVariant': 'Variant',
  'casting.nativeSettings': 'Settings',
  'casting.nativeProviderRow': 'Provider row',
  'casting.providerRowChoice': 'Key and address from',
  'casting.providerRowNone': 'No provider row',
  'casting.providerRowMissing': 'Not in the provider table this page could read.',
  'casting.providerKey': 'Key',
  'casting.providerKeySet': 'set',
  'casting.providerKeyNotSet': 'not set',
  'casting.providersUnread': 'The provider table could not be read, so this form cannot offer its rows.',
  'casting.providersUnreadRefusal': 'The provider table could not be read.',
  'casting.nativeWhat':
    "Native fields are the model, provider and variant that the program itself is given. This page does not check them against the program. A run's start checks them, and refuses in words what the program cannot take.",
  'casting.nativeEmpties': 'Spaces at the start and end are taken off. A provider or variant left empty is stored as none.',
  'casting.nativeAddEmpties': 'Leave all three empty to add the row without native fields.',
  'casting.nativeModelNeeded': 'Write the native model first. Nothing was sent.',
  'casting.nativeClear': 'Clear the native fields',
  'casting.nativeClearHold': 'Clear the hold',
  'casting.nativeHeld': 'Held after a native refusal.',
  'casting.nativeHeldNext': 'A person or secretary must change or clear this row.',
  'casting.what.hold': 'Held after a native refusal',

  // ---- w13n round 47: the chat's side list as one list, marked and filtered by project ----
  'chat.projects.filterLabel': 'Show the conversations of',
  'chat.projects.all': 'All projects',
  'chat.projects.more': '+{n}',
  'chat.projects.markTitle': 'Written in or about: {names}',
  'chat.projects.noneInThisList': 'No conversation in this list has a message in {name}.',
  // ---- w13n round 49: the mark the person puts on a message to an agent ----
  'record.section.intent': 'Intent',
  'message.intent.name.justAsk': 'Just ask',
  'message.intent.name.proposalFirst': 'Proposal first',
  'message.intent.justAsk': 'Just ask: answer only; change nothing.',
  'message.intent.proposalFirst': 'Proposal first: come back with a proposal; build nothing until the person says yes.',
  'officeLines.intentMarkBroken.line': 'The person said your reply broke their mark',
  'officeLines.intentMarkBroken.said':
    'The person pressed "mark broken" on your reply {reply} to their message {message}. Their mark said: {asks} ' +
    'Mole Office filed problem {problem}, which names the message, the mark and your reply.',
  // ---- w13n round 50: the intent selector beside Send, the mark on a sent message, and "mark broken" ----
  'chat.intent.selector': 'What the agent may do',
  'chat.intent.selectorNow': 'What the agent may do: {mark}',
  'chat.intent.name.none': 'No mark',
  'chat.intent.markBroken': 'Mark broken',
  'chat.intent.markBrokenTitle': 'This reply did not do what your "{mark}" mark asked. Files a problem and tells the agent.',
  'chat.intent.markBrokenSending': 'Filing…',
  'chat.intent.markBrokenFiled': 'Problem filed. The agent was told.',
  'chat.intent.markBrokenAlready': 'Already reported. Nothing new was written.',
  'chat.intent.markBrokenOpen': 'Open the problem',
  'chat.intent.markBrokenFailed': '"Mark broken" did not go through: {why}',
  // ---- w13n round 50d: the intent field's three choices on a record page, named as the selector beside Send names them ----
  'record.option.message.intent.none': 'No mark',
  'record.option.message.intent.just_ask': 'Just ask',
  'record.option.message.intent.proposal_first': 'Proposal first',
  // ---- w13n rounds 51 and 52: the checklists page and the checklists window, as chosen ----
  'nav.checklists': 'Checklists',
  'nav.what.checklists': "Checklists of people and agents, in one project or every project.",
  'checklists.title': 'Checklists',
  'checklists.loading': 'the checklists',
  'checklists.loadingOne': 'the checklist',
  'checklists.whose': 'Whose',
  'checklists.whose.everyone': 'Everyone',
  'checklists.whose.mine': 'Mine',
  'checklists.groupBy': 'Group by',
  'checklists.groupBy.owner': 'Owner',
  'checklists.groupBy.project': 'Project',
  'checklists.ownerKind.person': 'person',
  'checklists.ownerKind.agent': 'agent',
  'checklists.counts': '{open} still to do, {waiting} of them waiting on the owner',
  'checklists.countsNoneWaiting': '{open} still to do',
  'checklists.groupCounts': '{lists}, {counts}',
  'checklists.lists': '{n} checklists',
  'checklists.listsOne': '1 checklist',
  'checklists.progress': '{done} of {total} done',
  'checklists.state.open': 'Open',
  'checklists.state.inProgress': 'In progress',
  'checklists.state.waiting': 'Waiting on the owner',
  'checklists.state.done': 'Done',
  'checklists.state.superseded': 'Superseded',
  'checklists.fromMessage': 'From a message',
  'checklists.evidence.commit': 'Commit {hash}',
  'checklists.evidence.report': 'Report',
  'checklists.evidence.run': 'Run',
  'checklists.evidence.manual': 'Manual section',
  'checklists.mustBeInManual': 'Must be in the manual',
  'checklists.reminderOn': 'Reminder at {at}',
  'checklists.supersededBy': 'Replaced by a later message',
  'checklists.back': 'All checklists',
  'checklists.none': 'No checklist matches what is chosen.',
  'checklists.ownedBy': '{name}, {kind}',
  // THE PRESS'S ONE NAME: its accessible name and its hover text are both this, never two different things.
  'checklists.window.press': 'Your checklists',
  'checklists.window.pressTitle': 'Your checklists: {n} still to do',
  'checklists.window.title': 'My checklists',
  'checklists.window.titleOf': "{name}'s checklists",
  'checklists.window.close': 'Close',
  'checklists.window.empty': 'There are no items on these checklists.',
  'checklists.window.markDone': 'Mark done',
  'checklists.window.save': 'Mark done',
  'checklists.window.cancel': 'Cancel',
  'checklists.window.openPage': 'All checklists',
  'checklists.window.readOnly': 'Shown to read. Items are marked done on your own checklists.',
  'checklists.window.showDone': 'Show {n} done',
  'checklists.window.showDoneAndReplaced': 'Show {n} done or replaced',
  'checklists.window.hideDone': 'Hide the done items',
  'checklists.window.doneWith': 'Marked done with:',
  'checklists.windowSwitch': 'Show the checklists window at the top right',
  'checklists.windowSwitchNotKept': 'This browser keeps no settings, so the checklists window at the top right stays shown.',
  'checklists.picker.title': 'Choose evidence, or write your own words',
  'checklists.picker.kind': 'Kind of evidence',
  'checklists.picker.commit': 'Landed commit',
  'checklists.picker.manualOnly': 'Must be in the manual: only manual sections are offered.',
  'checklists.picker.find': 'Search by words in the title',
  'checklists.picker.loading': 'the choices',
  'checklists.picker.none': 'Nothing of this kind in this project yet.',
  'checklists.picker.noneWithWords': 'Nothing of this kind has those words in its title.',
  'checklists.picker.more': 'Show more ({n} left)',
  'checklists.picker.chooseFirst': 'Choose one from the list first.',
  // ---- w13n round 53: the window opens on the reader's own checklists; one press opens the full view ----
  // Each press's accessible name and hover text are both its one key.
  'checklists.window.showAll': 'All checklists',
  'checklists.window.backToMine': 'My checklists',
  // ---- w13n round 54: the review goes to the recipient shown (problem ZuhGWivnX7ug) ----
  'review.b.goingToTheWriter': "going to {name}, this page's writer, because no recipient was chosen",
  'review.b.goingToTheWriterUnnamed':
    "going to this page's writer, an agent with a name Mole Office could not read, because no recipient was chosen",
  'review.leave.toTheWriter': "Send sends them to {name}, this page's writer, because no recipient was chosen.",
  'talk.state.reviewGoesToAgentsOnly':
    'A review goes only to an agent, so it does not go to the person under To. The review column says who it goes to.',
  'talk.state.recipientHasNoRecord':
    'The agent under To has no record here, so the review cannot go to it. The review column says who it goes to.',
  'talk.state.recipientNotKept': 'The comment is in the review, but who it goes to was not saved',
  // ---- w13n round 58: Shutdown in the window and in the browser, for criteria W5 and W6 ----
  'server.shutDownOnlyTheOwner': 'Only the owner may shut Mole Office down, or a secretary holding the owner\'s grant where this office\'s list of what the grant carries says so. Nothing was stopped.',
  'server.shutDownRunsChanged':
    'Agent runs started after the list was read ({count} not in it). Nothing was stopped, and Mole Office is still running. Read the new list, and confirm again.',
  'shutDown.press': 'Shut down',
  'shutDown.pressTitle': 'Shut Mole Office down: the service, and every page of it',
  'shutDown.closeTheWindow': 'Close the window',
  'shutDown.closeTheWindowTitle': 'Close this window. Mole Office keeps running, and the tray opens the window again.',
  'shutDown.reading': 'Which agent runs are at work',
  'shutDown.couldNotRead': 'Mole Office could not read which agent runs are at work, so it did not shut down.',
  'shutDown.question': 'Shut Mole Office down?',
  'shutDown.atWork': 'Agent runs at work: {count}.',
  'shutDown.warning':
    'Shutting down pauses each of these runs and keeps its work. Nothing carries them on by itself: each one waits for your press on the Interrupted runs page.',
  'shutDown.agentNotNamed': 'An agent the run does not name',
  'shutDown.noMessage': 'Not answering a message',
  'shutDown.since': 'Since {since}',
  'shutDown.terminals': 'Terminals a person is working in: {count}. A shutdown cannot pause them, and they keep running.',
  'shutDown.confirm': 'Pause them and shut down',
  'shutDown.cancel': 'Keep Mole Office running',
  'shutDown.close': 'Close',
  'shutDown.notTheOwner': 'This page is not signed in as the owner of Mole Office.',
  'shutDown.busy': 'Shutting down',
  'shutDown.shuttingDown': 'Mole Office is shutting down. This page stops working once it has stopped.',
  'shutDown.shuttingDownWindow': 'Mole Office is shutting down. The window closes once it has stopped.',
  'shutDown.paused': 'Runs paused, with their work kept: {count}.',
  'shutDown.notPaused': 'Runs that did not stop and are still running: {count}.',
  get 'settingsPanel.title.windowshutdown'(): string { return SURFACES['settings.windowshutdown'] },
  'shutDown.windowOnly.heading': 'What the Shutdown press in this window does',
  'shutDown.windowOnly.whole': 'Shut Mole Office down',
  'shutDown.windowOnly.window': 'Close only the window, and keep Mole Office running',
  'shutDown.windowOnly.tray': 'The Shut down item in the tray always shuts Mole Office down.',
  // ---- w13n round 58: an installed office updates its own database, on its owner's press (src/server/lib/the-update.ts) ----
  'theUpdate.health': 'Mole Office is waiting for its owner to back up and update the database {file}. Nothing has been written to it.',
  'theUpdate.notServing':
    'Mole Office is not serving yet: its database needs an update, and it waits for its owner to press "Back up and update" on its page. Nothing was done.',
  'theUpdate.onlyTheOwner': 'Only the owner may back up and update the database. This request does not carry the owner\'s key, and it did not come from one of the programs of the computer Mole Office runs on. Nothing was done.',
  'theUpdate.alreadyPressed': 'The update has already been pressed. Nothing more was done.',
  'theUpdate.failed.noBackup': 'The backup could not be made, so the update did not start. The database was not changed.',
  'theUpdate.failed.noSafetyCopy':
    'The backup was made, but the copy kept for putting the file back could not be made ({why}). So the update did not start, and the database was not changed.',
  'theUpdate.failed.migrations': 'The update stopped before it finished. The migrations said:',
  'theUpdate.failed.checks': 'The update ran, but the checks after it failed:',
  'theUpdate.failed.notRestored':
    'The file could not be put back as it was before the update ({why}). The copy taken just before the update is kept at {safety}.',
  'theUpdate.check.integrity': 'SQLite\'s integrity check did not say ok: {said}',
  'theUpdate.check.before': 'The counts the migrations read before they wrote differ from the backup: {tables}',
  'theUpdate.check.after': 'The counts in the file differ from what the migrations counted when they finished: {tables}',
  'theUpdate.check.again': 'The start check still finds the database not up to date.',
  'theUpdate.check.fault': 'A check could not run: {why}',
  // ---- w13s round 257: the press gives each agent whose id is still a handle a new id ----
  'theUpdate.failed.remint': 'The update stopped at the step that gives each agent with an old-style id a new one:',
  'theUpdate.check.remint': 'The counts the change of agent ids read before it wrote differ from what the migrations counted when they finished: {tables}',
  'theUpdate.page.remintRefused':
    'Every agent kept the id it had. The step that gives each agent with an old-style id a new one refused, and wrote nothing. It is tried again the next time the database is updated. It said:',
  'theUpdate.page.title': 'Mole Office needs to update its database',
  'theUpdate.page.reading': 'Reading what the start check found…',
  'theUpdate.page.couldNotRead': 'This page could not read what Mole Office found. It tries again every two seconds.',
  'theUpdate.page.found':
    'This version of Mole Office keeps its database in a newer shape than the one on this computer. It checked what bringing the database up to date would do, on a copy.',
  'theUpdate.page.holdsHeading': 'What the database holds',
  'theUpdate.page.nothingChangedHeading': 'What has changed',
  'theUpdate.page.nothingChanged': 'Nothing yet. No row of the database has been written, and nothing is written until the owner presses below.',
  'theUpdate.page.willDoHeading': 'What the update will do, in the migrations\' own words',
  'theUpdate.page.whatThePressDoes': 'One press does four things, in order, and stops at the first that fails:',
  'theUpdate.page.step1': 'It backs the database up into {backups}, and checks the backup.',
  'theUpdate.page.step2': 'It brings the database up to date.',
  'theUpdate.page.step3': 'It checks the file with SQLite\'s integrity check, and checks its counts against the backup.',
  'theUpdate.page.step4': 'Then Mole Office opens as usual.',
  'theUpdate.page.press': 'Back up and update',
  'theUpdate.page.updating': 'Backing up and updating…',
  'theUpdate.page.pressFailed': 'The press did not reach Mole Office. Nothing was done.',
  // w13n round DW: where the press is, is said by whereToPress alone, so the two cannot disagree.
  'theUpdate.page.notTheOwner':
    'Only the owner may press this. This page was not opened by one of the programs of the computer Mole Office runs on, and it does not hold the owner\'s key.',
  // ---- w13n round DV: an offer shown without its press says where the press is ----
  'theUpdate.page.whereToPress': 'You can press it in the Mole Office window on the computer Mole Office runs on, or in a browser that has paired with this office.',
  'theUpdate.page.doneHeading': 'The database is up to date',
  'theUpdate.page.done': 'It was backed up, brought up to date and checked.',
  'theUpdate.page.holdsNow': 'It now holds {holds}.',
  'theUpdate.page.backupAt': 'The backup taken before the update is here:',
  'theUpdate.page.opening': 'Mole Office is opening…',
  'theUpdate.page.failedHeading': 'The update did not finish',
  'theUpdate.page.fileUnchanged': 'The database file is as it was before the press. Nothing in it was lost.',
  'theUpdate.page.fileRestored': 'The database file was put back as it was before the press. Nothing in it was lost.',
  'theUpdate.page.fileNotRestored': 'The database file may not be as it was. Do not press again. Keep the backup and the copy named above.',
  'theUpdate.page.noBackup': 'No backup was made.',
  'theUpdate.page.backupKept': 'The backup taken before the update is kept here:',
  'theUpdate.page.afterAFailure': 'Mole Office does not serve this database until it is up to date. Tell whoever looks after your Mole Office what this page says.',
  'record.section.whyTheCheckCrashed': 'Why the check crashed',
  'record.section.theModelsSteps': "The model's steps",
  'record.section.cutFromCommit': 'Cut from commit',
  // ---- w13n round CY: a check's clock leaves out the time it waited for a test seat ----
  'record.field.waitedForASeatSeconds': 'Seconds waited for a test seat',
  'record.section.waitedForASeatSeconds': 'Seconds waited for a test seat',
  // ---- w13n round CR: a session the office's key filed under the name of the agent that holds it ----
  'record.section.heldByItsFiler': 'Held by its filer',
  // ---- w13n round DM: the images a Codex worker's run was given at its start ----
  'record.section.imagesGiven': 'Images given',
  // ---- w13n round DP: a check the office queued that nothing in the office would start ----
  'record.section.aCheckNothingStarts': 'A check nothing starts',
  // ---- w13n round BC: a Codex run that answers a message takes its model from its agent's Casting row ----
  'devWords.said.modelCodexNeedsItsRow': "Nothing names a model for {agent}'s Codex runs that answer a message, so they take the Casting row in force for {role}.",
  'devWords.said.castingNoRowInForce': 'The Casting table has no row in force for {role}.',
  'devWords.said.castingRowNoProgram': 'Casting row {row} names no program.',
  'devWords.said.castingRowForAnotherProgram': 'Casting row {row} is for {program}, not Codex.',
  'devWords.said.castingRowNoModel': 'Casting row {row} names no model.',
  'devWords.said.castingRowNoNativeModel': 'Casting row {row} has no native model.',
  'devWords.said.castingRowNoEffort': 'Casting row {row} has no effort.',
  'devWords.said.modelCodexFillInTheRow': 'Fill in a Codex row for {role}, with its native model and effort, on the Casting page.',
  'devWords.said.modelCodexNoCard': "Nothing names a model for {agent}'s Codex runs that answer a message, and its role has no card on the Casting page.",
  'devWords.said.modelCodexTakesTheAgentsRow': "A Codex run that answers a message takes its model from the answering agent's Casting row, so nothing here names one.",
  // ---- w13n round BF: a model has one name for its Casting row ----
  'devWords.said.modelNameMatchesRowsOfDifferentModels': 'The model name {name} matches Casting rows that name different models: {rows}. No row gives it a selection or an effort.',
  'devWords.said.effortFromTheNamedRow': 'The run gets effort {effort} from Casting row {row}, the one row in force that the model name {name} names.',
  'devWords.said.effortFromAgentInPlaceOfTheRow': "The run gets effort {effort} from the agent's own record, in place of Casting row {row}'s effort {rowEffort}.",
  'devWords.said.effortTheRunIsRefused': 'The run is refused, so no effort is set.',
  // ---- w13n round BJ: a next round takes its model from the role's Casting row in force ----
  'devWords.said.roundKeepsThePreviousModel': 'No Casting row is in force for {card} in {project}, so the round keeps model {model} from run {run}.',
  'devWords.said.roundRowCastsAnotherRuntime': 'Casting row {row}, in force for {card}, casts {program} with {model}, and the round continues run {run} on {runtime}, so it cannot take its model from that row.',
  // ---- w13n round BL: a second check of a run that ends with no verdict files a problem for the run's starter ----
  'noticeWords.aNoVerdictProblemWasFiled': "It tells a run's starter that a problem was filed because two check sessions of the run ended with no verdict.",
  // The waking words of the two Codex stops, for every Codex model. Their English is kept in src/config/word-sources.mjs.
  'noticeWords.codexAnsweredAtCapacity': NOTICE_WORDS.codexAnsweredAtCapacity,
  'noticeWords.codexMetAUsageLimit': NOTICE_WORDS.codexMetAUsageLimit,
  // ---- w13q round 55: a launcher wait of more than an hour tells the starter ----
  'noticeWords.aRunWaitsLongOnALimit': NOTICE_WORDS.aRunWaitsLongOnALimit,
  // ---- w13n round BQ: the check panel says whether a records seal held link evidence ----
  'chk.read.recordsSealedBeforeLinks': 'This check read the sealed record revisions. The seal was made before seals pinned links, so it holds no link evidence.',
  'chk.read.recordsLinksNotSaid': 'This check read the sealed record revisions. Its record does not say whether it read link evidence.',
  // ---- w13n round CC: a Casting row's work group is a cell of the row, and the roll for hard or simple work reads it ----
  'casting.col.work_group': 'Work group',
  'casting.workGroup.hard': 'Hard work',
  'casting.workGroup.simple': 'Simple work',
  'casting.workGroup.none': 'No group',
  'casting.what.migratedBy': 'Changed by migration {id}',
  'casting.from.theOldListSaid': "as the roll's old list said: {words}",
  // No door sends this refusal since migration 0349 made the labels; its translations still hold it.
  'server.castingNotAWorkGroup': '"{group}" is not a work group. Give hard, simple, or an empty value for no group. Nothing was written.',
  // ---- w13n round CS: a Casting row's own program settings, and the names the launcher sets itself ----
  ...{
    'server.castingRowSettingsWithNoProgram': 'Casting row {id} has no program, so it cannot hold settings, which go to its program. Nothing was changed.',
    'server.castingNewRowSettingsWithNoProgram': 'This new Casting row has no program, so it cannot hold settings, which go to its program. Nothing was changed.',
    'server.castingRowSettingsNotForProgram': 'Casting row {id} runs {program}, which takes no settings from a Casting row. Nothing was changed.',
    'server.castingNewRowSettingsNotForProgram': 'This new Casting row runs {program}, which takes no settings from a Casting row. Nothing was changed.',
    'server.castingRowSetsAGuardedName':
      "Casting row {id} sets {name} for {program}, which the launcher sets itself ({guards}). A row may not set it. Nothing was changed.",
    'server.castingNewRowSetsAGuardedName':
      "This new Casting row sets {name} for {program}, which the launcher sets itself ({guards}). A row may not set it. Nothing was changed.",
    'server.castingRowSetsAPartCodexCannotName':
      'Casting row {id} sets {name} for codex, and Codex\'s -c cannot name its part "{part}". Codex splits a -c name at every dot and at its first equals sign, and trims the spaces at its two ends. Nothing was changed.',
    'server.castingNewRowSetsAPartCodexCannotName':
      'This new Casting row sets {name} for codex, and Codex\'s -c cannot name its part "{part}". Codex splits a -c name at every dot and at its first equals sign, and trims the spaces at its two ends. Nothing was changed.',
  } satisfies Record<`server.${CastingSettingsRefusalCode}`, string>,
  // ---- w13n package OP: a worker ask with no recorded time refuses, and the package page draws it ----
  ...{
    'server.packageWorkerAskHasNoTime':
      'The ask of {worker} has no time: the time was not recorded, so this list cannot say when it was made. Nothing was shown rather than a made-up time.',
  } satisfies Record<`server.${PackageWorkerAskRefusalCode}`, string>,
  // ---- w13n round CT: the provider table beside the Casting table, and the person's two lines about it ----
  'officeLines.aSecretaryAddedAProvider.line': 'A secretary added a provider',
  'officeLines.aSecretaryAddedAProvider.said':
    '{agent} added the provider {id}, named {name}. It is for {programs}. It sends to {host}. It names the key ' +
    "file's entry {keyName} for its key. If you did not ask for this, tell the secretary.",
  'officeLines.aSecretaryChangedAProvider.line': 'A secretary changed a provider',
  'officeLines.aSecretaryChangedAProvider.said':
    '{agent} changed the provider {id}, named {name}. Before, it was for {programsBefore}, sent to {hostBefore} ' +
    "and named the key file's entry {keyNameBefore}. Now it is for {programs}, sends to {host} and names the key " +
    "file's entry {keyName}. If you did not ask for this, tell the secretary.",
  'noticeWords.aSecretaryAddedAProvider': 'It tells the person that a secretary added a provider beside the Casting table.',
  'noticeWords.aSecretaryChangedAProvider':
    "It tells the person that a secretary changed a provider's address, programs or key name beside the Casting table.",
  // ---- w13n round DP: a queued check that nothing in the office will start says so, and its run's starter is told once ----
  'noticeWords.theOfficeStartedNoCheck':
    "It tells a run's starter that the office has started no check of the run it queued, because nothing in this office would start it.",
  ...{
    'server.providerBodyNotAnObject': 'The body must be an object with the fields id, name, programs, baseAddress and keyName. Nothing was written.',
    'server.providerBodyHasOtherFields':
      'The body names {fields}, which a provider does not have. A provider has id, name, programs, baseAddress and keyName. Nothing was written.',
    'server.providerChangeNamesNothing': 'The change to provider {id} names no field to change. Name, programs, baseAddress or keyName. Nothing was written.',
    'server.providerIdNotValid': "A provider's id is 2 to 40 lowercase letters, digits and dashes. Nothing was written.",
    'server.providerIdTaken': 'A provider with the id {id} is there already. Nothing was written.',
    'server.providerIdChanged': "Provider {id} keeps its id. A provider's id never changes. Nothing was written.",
    'server.providerNotFound': 'No provider has the id {id}. Nothing was written.',
    'server.providerNameNotValid': "A provider's name is 1 to 120 characters after spaces at its ends are taken off. This one has {length}. Nothing was written.",
    'server.providerProgramsNotAList': "A provider's programs are a list of at least one of codex, claude-code, opencode and dsh. Nothing was written.",
    'server.providerProgramNotKnown': '"{program}" is not a program a provider can be for. Give codex, claude-code, opencode or dsh. Nothing was written.',
    'server.providerProgramRepeated': 'The programs name {program} more than once. Name each program once. Nothing was written.',
    'server.providerAddressNotAnAddress': 'The base address cannot be read as an address. Give https:// and a host, or http:// on 127.0.0.1 or [::1]. Nothing was written.',
    'server.providerAddressNoHost': 'The base address starts with {scheme}:// but names no host. Nothing was written.',
    'server.providerAddressHasCredentials':
      'The base address to {host} carries a user name or a password before the host. Give the address without them, and keep the key in the key file. Nothing was written.',
    'server.providerAddressScheme': 'The base address starts with {scheme}:, and a provider takes only https:, or http: on 127.0.0.1 or [::1]. Nothing was written.',
    'server.providerAddressHttpNotLoopback':
      'The base address to {host} is http:, which is taken only on 127.0.0.1 or [::1]. The host must be written exactly that way. Give https: for any other host. Nothing was written.',
    'server.providerAddressHasQuery': 'The base address to {host} has a query, the part after "?". Give it without one. Nothing was written.',
    'server.providerAddressHasFragment': 'The base address to {host} has a fragment, the part after "#". Give it without one. Nothing was written.',
    'server.providerKeyNameNotValid':
      "A provider's key name is the name of an entry in the office's key file, never a key: up to 64 lowercase letters, digits and dashes. Nothing was written.",
    'server.providerKeyNameKeptByTheOffice': "The key file's entry {name} is one the office keeps for itself, so a provider may not name it. Nothing was written.",
    'server.providerPersonNotProved':
      'This request names the owner and carries no key of the owner\'s, so it does not add, change or remove a provider. The owner does that with the owner\'s key, even while the key window is open. An agent whose card holds "The Casting table" does it with its own key. Nothing was written.',
    'server.providerNamedByACastingRow': 'Provider {id} is not removed, because the Casting table names it, in row {rows}. Change or remove each row that names it first. Nothing was written.',
    'server.castingProviderRowNotFound': 'No provider has the id {provider}, so a Casting row cannot name it. Nothing was changed.',
    'server.castingProviderRowNoProgram': 'This Casting row has no program, so it cannot name provider {provider}, which is for a program. Nothing was changed.',
    'server.castingProviderRowNotForTheProgram':
      "This Casting row runs {program}, and provider {provider} is for {programs}. Add the row's program to the provider, or name another provider. Nothing was changed.",
    'server.castingProviderRowNotYet':
      'This Casting row runs {program}, which does not take its key from a provider yet, so it cannot name provider {provider}. Only a dsh check and a Codex check take one now. Nothing was changed.',
    'server.castingProviderRowOnlyForTheInspector':
      "This Casting row is for {role}, and only a check takes its key from a provider so far, so it cannot name provider {provider}. Name it on the inspector's row. Nothing was changed.",
    'server.dshProviderGone': 'DSH check refused: Casting row {row} names provider {provider}, and no provider has that id now. Change the row. Nothing was started.',
    'server.dshProviderNotForDsh': 'DSH check refused: Casting row {row} names provider {provider}, which is for {programs} now, not dsh. Change the row or the provider. Nothing was started.',
    'server.dshProviderKeyNotSet':
      "DSH check refused: Casting row {row} names provider {provider}, and the key file's entry {entry} is not set. Set it, or change the row. Nothing was started.",
    'server.dshProviderWhileTheRouterIsOn':
      'DSH check refused: Casting row {row} names provider {provider}, and the provider router is on. The router leaves routed keys out of an exec, so the check could not be handed the key. Nothing was started.',
    'server.codexProviderGone': 'Codex check refused: Casting row {row} names provider {provider}, and no provider has that id now. Change the row. Nothing was started.',
    'server.codexProviderNotForCodex': 'Codex check refused: Casting row {row} names provider {provider}, which is for {programs} now, not codex. Change the row or the provider. Nothing was started.',
    'server.codexProviderKeyNotSet':
      "Codex check refused: Casting row {row} names provider {provider}, and the key file's entry {entry} is not set. Set it, or change the row. Nothing was started.",
    'server.codexProviderWhileTheRouterIsOn':
      'Codex check refused: Casting row {row} names provider {provider}, and the provider router is on. While it is on, no check is handed a key from a provider row. Nothing was started.',
  } satisfies Record<`server.${ProviderTableRefusalCode}`, string>,
  // Wave 13n, worker D: a difficulty is a Casting label, the strong-model hint reads the Casting rows, the align door
  // stores its hints, and a day's read says what it left out. Moved here from en-wave-13y and en.ts with this package's
  // words, English and Chinese together.
  'delegation.notice.alignedBodyShape': '{who} restated your package "{title}" (task {task}). Restated: "{restated}" The plan: {plan} The office\'s hints: {hints} Answer aligned or differs at POST /api/delegation/{task}/align-answer.',
  'delegation.notice.noHints': 'There is no hint.',
  'delegation.notice.goOnWithHints': 'The supervisor goes on with these hints, for this reason: {why}',
  'delegation.plan.worker': 'Worker {worker}: {outcome}. Points: {points}. Files or area: {files}.',
  'delegation.plan.difficulty': 'Difficulty: {difficulty}, because {why}.',
  'delegation.plan.difficultyMissing': 'Difficulty: not given.',
  'delegation.plan.difficultyNoReason': 'Difficulty: {difficulty}, with no reason given.',
  'delegation.plan.model': 'Model: {model}, because {why}.',
  'delegation.plan.modelNoReason': 'Model: {model}, with no reason given.',
  'delegation.plan.waves': 'Waves: {n}.',
  'delegation.plan.wait': 'Wave {wave} waits for: {why}.',
  'delegation.plan.waitMissing': 'Wave {wave} names nothing outside the line it waits for.',
  'delegation.hint.sameFiles': 'Two workers change the same files or area: {workerA} and {workerB} both name {files}.',
  'delegation.hint.moreWorkersThanPoints': 'The plan gives work to {workers} workers and the package has {points} points, so one worker could take more than one point.',
  'delegation.hint.strongModelNoReason': '{worker} is judged {difficulty} and is given {model}, with no reason written for that model. The rows for that label give {models}, and a model matches a row when it is the row\'s model as written, or the part of it after its last "/", with upper and lower case taken as the same.',
  'delegation.hint.strongModelNoModel': '{worker} is judged {difficulty} and is given {model}, with no reason written for that model. The rows for that label give no model, so the office does not guess one. A model matches a row when it is the row\'s model as written, or the part of it after its last "/", with upper and lower case taken as the same.',
  'delegation.hint.difficultyNotALabel': '{worker} is judged "{difficulty}", which is not a label the office knows. The labels are {labels}.',
  'delegation.hint.missingDifficultyOrReason': '{worker} is missing {missing}.',
  'delegation.hint.moreThanOneWave': 'The package takes {waves} waves. A second wave should wait on something outside the line.',
  'delegation.hint.waveWaitsForNothing': 'Wave {wave} names nothing outside the line that it waits for.',
  'planShape.title': 'The plan',
  'planShape.noPlan': 'No plan has been sent with an alignment yet.',
  'planShape.unreadable': 'The plan could not be read in either shape, so it is not shown.',
  'planShape.oldPlan': 'This plan was written before plans had a fixed shape. It is shown as it was.',
  'planShape.restated': 'The restatement',
  'planShape.worker': 'Worker',
  'planShape.outcome': 'Outcome',
  'planShape.points': 'Points',
  'planShape.files': 'Files or area',
  'planShape.difficulty': 'Difficulty',
  'planShape.difficultyWhy': 'Why this difficulty',
  'planShape.model': 'Model',
  'planShape.modelWhy': 'Why this model',
  'planShape.notGiven': 'Not given',
  'planShape.waves': { one: 'One wave', other: '{n} waves' },
  'planShape.wave': 'Wave {n}',
  'planShape.waitsFor': 'Waits for',
  'planShape.hints': 'The office\'s hints',
  'planShape.noHints': 'The office has no hint about this plan.',
  'planShape.hintsNotStored': 'The office\'s hints were not stored with this alignment, so this page does not say whether it had any.',
  'planShape.goOnWhy': 'Why the supervisor went on',
  'planShape.answer': 'The answer',
  'planShape.aligned': 'Aligned',
  'planShape.differs': 'Differs',
  'planShape.waiting': 'Waiting for an answer',
  'packageWorkers.title': 'Its workers',
  'packageWorkers.intro': 'Every worker this package was given to, oldest ask first. A worker with no run filed is listed too, so nobody is dropped without a word.',
  'packageWorkers.none': 'No worker has been started for this package.',
  'packageWorkers.noneRecorded': 'not recorded',
  'packageWorkers.worker': 'worker',
  'packageWorkers.asked': 'asked',
  'packageWorkers.state': 'run',
  'packageWorkers.noRun': 'no run filed',
  'packageWorkers.model': 'model',
  'packageWorkers.points': 'points',
  'packageWorkers.difficulty': 'difficulty',
  'packageWorkers.why': 'why',
  'packageWorkers.tokens': 'tokens',
  'packageWorkers.minutes': 'minutes',
  'packageWorkers.running': 'still running',
  'packageWorkers.notRead': 'not read',
  'packageWorkers.wentBack': 'results back',
  'packageWorkers.tokenCount': '{total} in all ({input} in, {output} out)',
  'packageWorkers.minuteCount': { one: '{n} minute', other: '{n} minutes' },
  'packageWorkers.handbacks': 'Hand-backs: {total} in all, {byWorkers} naming a worker and {notNaming} naming none.',
  'packageWorkers.askedOn': 'Asked on {title}.',
  'packageWorkers.asksNone': 'The ask is not on a supervisor run the office can read.',
  'packageWorkers.wanted': 'wanted',
  'packageWorkers.starting': 'starting',
  'packageWorkers.started': 'started',
  'packageWorkers.failed': 'failed',
} as const
