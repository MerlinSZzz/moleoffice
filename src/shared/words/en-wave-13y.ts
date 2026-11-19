// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The English list's place for wave 13y's new words, in English only. Their Chinese is written in
// the translation round before a version, and until then a Chinese page shows the English. joined.ts reads this file.
import { SURFACES } from '../surfaces.ts'
import { englishWord } from '../words.ts'

export const enWave13y = {
  'gates.row.package-alignment-answer': 'Ask for an answer to a package plan before work continues, and remind the maker when a hand-back is not aligned.',
  'roundStart.startAfterPlan': 'Start work after writing the restatement and plan.',
  'roundStart.answerPending': 'The restatement has been written. Continue the work.',
  'roundStart.waitForAnswer': 'The parent answers there, aligned or differs. The hand-back waits for an aligned answer.',
  'roundStart.badAnswerSetting': 'answerRequired is not a boolean',
  'g6a.sessions.readIsAlreadyOut': 'A reading of the new project is already under way. Its answer will replace these rows.',
  'delegation.inspection.setting': 'Inspect handed-back packages',
  'delegation.inspection.settingSays': 'The inspector gives an opinion on each point of a handed-back package.',
  'delegation.inspection.on': 'On',
  'delegation.inspection.off': 'Off',
  'delegation.inspection.points': 'Handed-back points',
  'delegation.inspection.notLookedAt': 'The inspector has not checked this point.',
  'delegation.inspection.rulesKept': 'Rules kept',
  'delegation.inspection.rulesNotKept': 'Rules not kept',
  'delegation.inspection.outcome.done': 'Done',
  'delegation.inspection.outcome.part': 'Partly done',
  'delegation.inspection.outcome.not': 'Not done',
  'delegation.inspection.workspaceDoor': 'Send packageInspection as true or false to choose whether an inspector reads handed-back package points.',
  'delegation.inspection.unreadablePoints': 'Each point needs pointId, judged (done, off_target, narrower, more_than_asked or unfinished), holds, rulesKept and a non-empty why. Nothing was written.',
  'delegation.inspection.sentence.done': 'done',
  'delegation.inspection.sentence.off_target': 'done but off target',
  'delegation.inspection.sentence.narrower': 'narrower than asked',
  'delegation.inspection.sentence.more_than_asked': 'more than asked',
  'delegation.inspection.sentence.unfinished': 'unfinished',
  'delegation.inspection.judged.done': 'Done',
  'delegation.inspection.judged.off_target': 'Done but off target',
  'delegation.inspection.judged.narrower': 'Narrower than asked',
  'delegation.inspection.judged.more_than_asked': 'More than asked',
  'delegation.inspection.judged.unfinished': 'Unfinished',
  'delegation.inspection.judged.part': 'Partly done',
  'delegation.inspection.judged.not': 'Not done',
  'delegation.inspection.claimsCannotHold': 'In the judgment of {title}, done, off target and more than asked hold only for points handed back as done; narrower and unfinished hold only for points handed back as part or not: {claims}. Nothing was written.',
  'delegation.inspection.verdictClaimsCannotHold': 'The verdict must judge every inside package this run handed back that waits for a check, each point exactly once. Done, off target and more than asked hold only for points handed back as done; narrower and unfinished hold only for points handed back as part or not: {lacks}. Nothing was written.',
  'module.requirementsPart': 'Requirements',
  'server.moduleRequirementsDoor': 'Replace a module’s requirements: send {items: [ProgressItem, ...], ifVersion?: string}. The person or a secretary proved by its own key may update them. The answer gives the module, its version, and the update time and author; each update is kept in the change log.',
  'server.carryableAgentIds': 'GET /api/messages/carryable-agent-ids reads the agents with a queued message you may read for whom starting a new agent would carry something.',
  'agentTags.noProjects': 'No projects',
  'agentTags.heading': 'Your tags',
  'agentTags.change': 'Change tags',
  'agentTags.loading': 'Loading your tags…',
  'agentTags.name': 'Tag name',
  'agentTags.colour': 'Tag colour',
  'agentTags.create': 'Create tag',
  'agentTags.nameRequired': 'Enter a tag name.',
  'agentTags.colourRefused': 'Choose a colour that can be seen on both light and dark backgrounds.',
  'agentTags.changed': 'Your tags no longer match the office, so nothing was saved. Read them again; what you typed is kept.',
  'agentTags.readAgain': 'Read them again',
  'server.agentTagsUnreadable': 'Your agent tags could not be read.',
  'server.agentTagsNeedPerson': 'Only a registered person can keep agent tags.',
  'server.agentTagsNeedList': 'Send no more than 100 agent tags.',
  'server.agentTagsBadTag': 'Each tag needs a name, a colour and a list of agents.',
  'server.agentTagsBadName': 'A tag name must have 1 to 60 characters.',
  'server.agentTagsDuplicateName': 'Give each tag a different name.',
  'server.agentTagsBadColour': 'Choose a colour that can be seen on both light and dark backgrounds.',
  'server.agentTagsUnknownAgent': 'Each tagged agent must be registered in this office.',
  'chat.moreAgentConversations': 'Show more conversations',
  'server.agentConversationsCursorInvalid': 'The conversation page cursor could not be read.',
  'server.agentConversationsCursorProject': 'The conversation page cursor was made for {from}, not {to}.',
  'server.agentConversationsAllProjects': 'all projects',
  'server.queuedAgentIds': 'GET /api/messages/queued-agent-ids reads registered agent IDs with a queued message you may read. Each ID appears once.',
  'newAgentKeys.checking': 'Checking…',
  'newAgentKeys.nothingToCarry': 'There is nothing to carry for this agent.',
  // The refusal of the door that keeps a person's pages in front of the sidebar: src/server/api/sidebar-pins.ts.
  'server.sidebarPinsRefused': '{reason} Nothing was changed.',
  // Home's words: its layout, the bars of Agents at work and the week of Schedule (wave 13y).
  'server.homeLayoutRefused': '{reason} Nothing was changed.',
  'home.layout.reading': 'your layout of Home',
  'home.layout.unreadable': 'Your kept layout of Home could not be read. Home shows its parts in one column until you move one.',
  'home.layout.notRead': 'Your kept layout of Home could not be read. Home shows its parts in one column.',
  'home.layout.notKept': 'This move was not kept. Home shows the layout kept before it.',
  'home.layout.move': 'Move',
  'home.layout.moveThePart': 'Move {part}',
  'home.layout.drag': 'Drag to move {part}',
  'home.layout.goesHere': '{part} goes here',
  'home.layout.up': 'Up',
  'home.layout.down': 'Down',
  'home.layout.toBand': 'To the band across the top',
  'home.layout.toFirst': 'To the first column',
  'home.layout.toSecond': 'To the second column',
  'home.layout.room.band': 'The band across the top',
  'home.layout.room.first': 'The first column',
  'home.layout.room.second': 'The second column',
  'home.bars.heading': '{agents} in {busy} of {projects}',
  'home.bars.agents': { one: '{n} agent', other: '{n} agents' },
  'home.bars.projects': { one: '{n} project', other: '{n} projects' },
  'home.bars.headingReading': 'The agents at work are still being counted.',
  'home.bars.working': 'Working',
  'home.bars.waiting': 'Waiting on you',
  'home.bars.stuck': 'Stuck',
  'home.bars.said': '{working} working, {waiting} waiting on you, {stuck} stuck',
  'home.bars.partTitle': '{part}: {n}',
  'home.bars.reading': 'This project is still being counted.',
  'home.bars.unread.roster': 'Its agents could not be read, so nothing is counted.',
  'home.bars.unread.waiting': 'The waiting list could not be read, so nothing is counted.',
  'home.bars.unread.attention': 'Its late or stuck work could not be read, so nothing is counted.',
  'home.bars.unread.doing': 'Which runs serve its agents could not be read, so nothing is counted.',
  'home.bars.notCounted': { one: '{n} project could not be counted. Its bar says why.', other: '{n} projects could not be counted. Their bars say why.' },
  'home.bars.stillReading': { one: '{n} project is still being counted.', other: '{n} projects are still being counted.' },
  'home.bars.cannotTell': {
    one: '{n} waiting row does not say which agent it came from, so it is not counted.',
    other: '{n} waiting rows do not say which agent they came from, so they are not counted.',
  },
  'home.week.title': 'The next seven days',
  'home.week.readingWeek': 'the next seven days',
  'home.week.reading': 'This day is still being read.',
  'home.week.notRead': 'not read',
  'home.week.unread': 'This day could not be read.',
  'home.week.noToday': 'Today could not be read, so the next seven days cannot be counted from it.',
  'home.week.notCounted': 'The next seven days could not be counted from the day the server gave as today.',
  'home.openTheSchedule': 'Open the schedule',
  'records.agent.noProfile': 'This agent has no profile.',
  'pairing.unpaired.title': 'This browser is not paired yet',
  'pairing.unpaired.trust': 'On the main computer, open Worlds and choose Trust a machine. Add this device, then check again here.',
  'pairing.unpaired.ask': 'Ask the main computer to approve this browser.',
  'pairing.unpaired.askButton': 'Ask to pair',
  'pairing.unpaired.waiting': 'On the main computer, open the Embassy and confirm this browser.',
  'pairing.unpaired.retry': 'Try again',
  'pairing.unpaired.onThisComputer': 'Pair this browser on the main computer.',
  'pairing.unpaired.pairButton': 'Pair this browser',
  'pairing.unpaired.loading': 'Checking how this browser can be paired…',
  'pairing.unpaired.failed': 'Pairing could not be checked. Try again.',
  'chat.status.personal': 'Personal line',
  'chat.status.flow': 'Working on',
  'chat.status.reading': 'Reading…',
  // In the open conversation's heading, as the presence word and on the "Working on" line, when the agent's status
  // could not be read: src/web/components/Chat.tsx and src/web/lib/chat-status.tsx (wave 13y round 111).
  'chat.status.couldNotBeRead': 'Could not be read',
  // Design D of the chat: the split beside the page, its seam and the phone's bar. The seam's three
  // presses, the seam itself, the press that puts the chat back beside the page, the phone's way
  // back and the press that opens the chat from the phone's bar (wave 13y).
  'chat.layout.single': 'Show one column',
  'chat.layout.sideBySide': 'Show side by side',
  'chat.split.swap': 'Swap sides',
  'chat.split.window': 'Open the chat in its own window',
  'chat.split.away': 'Put the chat away',
  'chat.split.seam': "Drag to change the chat's width. Double-click to give the page its reading width.",
  'chat.split.beside': 'Put the chat beside the page',
  'chat.split.back': 'Back to the page',
  'chat.split.open': 'Open the chat',
  // Settings, the chat button's panel: when the button shows and how the chat opens, each answer's name and what it
  // does, and what putting each back to not chosen does: src/web/components/ChatCircle.tsx (wave 13y).
  'chat.circle.stays': 'When it shows',
  'chat.circle.staysUnread': 'When something is unread',
  'chat.circle.staysUnreadSays': 'While the chat is shut and a message or group is unread',
  'chat.circle.staysAlways': 'Always',
  'chat.circle.staysAlwaysSays': 'In the bottom-right corner on every page, unless the open chat covers it',
  'chat.circle.opens': 'How the chat opens',
  'chat.circle.opensSplit': 'Beside the page',
  'chat.circle.opensSplitSays': 'As tall as the window. On a narrow screen it covers the page',
  'chat.circle.opensWindow': 'In a window',
  'chat.circle.opensWindowSays': 'Over the corner of the page',
  'chat.circle.backStays': 'If saved, the button shows only while something is unread.',
  'chat.circle.backOpens': 'If saved, the chat opens beside the page.',
  // Design D's quote: the shape that takes the words selected on the page into the next message,
  // the chip above the writing box, and the press that takes the quote back out (wave 13y).
  'chat.quote.press': 'Quote the selected words',
  'chat.quote.whole': 'All of {about}',
  'chat.quote.from': 'From {about}',
  'chat.quote.remove': 'Take this quote out',
  'chat.status.more': 'and {n} more',
  'chat.status.viewRuns': 'View runs',
  'chat.status.allRuns': 'Recorded runs',
  'chat.status.close': 'Close',
  'chat.status.addPersonal': 'Set personal line',
  // A file a message carries that the chat does not draw: its row in src/web/components/MessagePictures.tsx.
  'chat.attachment.sizeUnknown': 'Not said',
  // The one attach press in the writing box, the line above the box and the row of files held: src/web/components/PictureToSend.tsx.
  'chat.attachment.attach': 'Attach a file',
  'chat.attachment.files': 'The files to send',
  'harnesses.beingReadAgain': 'Read {ago}. It is being read again.',
  // The read-only panel for MOLE_OFFICE_REPLY_REMINDER_MINUTES: ReplyReminderPanel in src/web/components/ThisComputer.tsx.
  get 'settingsPanel.title.replyreminder'(): string { return SURFACES['settings.replyreminder'] },
  'settingsPanel.replyReminder.what': 'how long a person waits before an agent is reminded',
  'settingsPanel.replyReminder.label': 'Remind the agent after',
  'settingsPanel.replyReminder.minutes': { one: '{n} minute', other: '{n} minutes' },
  'settingsPanel.replyReminder.builtIn': '{minutes}, the default',
  'settingsPanel.replyReminder.meaning':
    "One reminder to an agent that leaves a person's message unanswered this long. Set on the computer that runs Mole Office.",
  // What the office saw of a hand-filed running run's process: ItsProcessMark in src/web/components/SessionPanel.tsx.
  'sessions.itsProcess.running': 'its process is running',
  'sessions.itsProcess.none': 'by its own word; no process seen',
  'sessions.itsProcess.notItsOwn': 'by its own word; its process is not shown to be its own',
  'sessions.itsProcess.saw': 'What the office saw: {says}.',
  'sessions.itsProcess.unreadable':
    '{where} ("{title}") has an itsProcess this page cannot read, so no mark is drawn for its process: {value}',
  // A run whose record holds no start time: the "Started" fact of src/web/pages/SessionPage.tsx.
  'runPage.startUnknown': 'Start time unknown.',
  'runPage.firstRecorded': 'First recorded by this office at {time}.',
  'runPage.startTheOfficeRead': 'Started {time}, as this office read it from the process.',
  // A secretary whose reports were ended: broadcastLines in src/shared/broadcast.ts.
  'broadcast.says.noTimes': 'This secretary has no report times, so the office sends it no reminder and does not pause it.',
  // The lead pane's sentences when no participant the page read answers to the agent: LEADING in src/shared/messages.ts.
  'chatEnglish.lead.noName.offer': 'An agent this page has no name for wants to take you to {where}.',
  'chatEnglish.lead.noName.stopFollowing': 'Stop following the agent this page has no name for',
  // SHORT, because at 390 this is the pane's one line and it is cut at the window's edge.
  'chatEnglish.lead.noName.following': 'Following an agent with no name here',
  'chatEnglish.lead.noName.whileFollowing':
    'While you are following an agent this page has no name for, it can move this page to what it wants to show you. One press stops that.',
  'chatEnglish.lead.noName.broughtYouHere': 'An agent this page has no name for brought you here to show you this.',
  'chatEnglish.lead.noName.closeThePaneSaid': 'Close what the agent brought you here to see',
  // A pipeline wall standing at a block that is no step of the pipeline: the wall in buildPipelineScope, in
  // src/web/components/graph/model.ts.
  'graph.wall.aStepNotInThisPipeline': 'a step that is not in this pipeline',
  // The wall's sentence when it stands at such a block: the same wall, in the same file.
  'graph.wall.standsAtAStepNotInThisPipeline':
    'The wall stands at a step that is not in this pipeline. Mole Office cannot tell which steps of this pipeline it holds back.',
  // A writer whose stored sender no participant the page read answers to, in the lead pane's words: unregisteredName in
  // src/shared/messages.ts, which every page that names a writer asks (wave 13y round 88).
  'chat.anAgentThisPageHasNoNameFor': 'An agent this page has no name for',
  'chat.aPersonThisPageHasNoNameFor': 'A person this page has no name for',
  // Under the heading of the conversation with a writer nobody registered, when the writer typed no line, so the heading
  // says it left no name: the unregistered conversation in src/web/components/Chat.tsx.
  'chat.unregisteredIsNoName':
    'This writer is not registered, and its messages carry no name for it. There is nothing to write back to. If it registers, everything here moves under its contact.',
  // Under an agent's name in the chat and on its profile, when the secretaries' duties could not be read; {why} is the
  // failure: TheDutyLine in src/web/components/ChatDuty.tsx.
  'chat.duty.unread': 'Its duty line could not be read: {why}',
  // In the open conversation, in place of "Reading this conversation…", when its read failed; {why} is the failure: the
  // conversation's half in src/web/components/Chat.tsx (wave 13y round 91).
  'chat.conversationUnread': 'This conversation could not be read: {why}',
  // The duties field `supervisors` in src/shared/kinds.ts: the supervisors a secretary answers for, each with the area the
  // chat draws under its name (wave 13y round 91, item 12b). The word is the section's own title.
  'record.section.supervisors': 'Supervisors',
  'settingsPanel.plugins.view.status': 'presence, personal words and recorded flow',
  // The phone bar's urgent pill when the office answered and refused the project the browser
  // remembers: TheNeedsSomebodyPill in src/web/App.tsx.
  'frameWords.pill.projectRefused': 'project refused',
  // The pencil beside the reader's own name in the chat, drawn while they have no status, which opens the status
  // editor: the reader's own row in src/web/components/Chat.tsx (wave 13y round 113).
  'chat.setYourStatus': 'Set your status',
  // The hover text of the chat panel's top row, which moves the panel when it is dragged: the top row in
  // src/web/components/Chat.tsx (wave 13y round 113; no hold since round 166).
  'chat.move.hold': 'Drag here to move the chat',
  // The same row's words once the panel was unlocked by a hold. Since round 166 nothing is unlocked and nothing
  // draws these words; the key stays because its translations are kept with it.
  'chat.move.drag': 'Drag to move',
  // The press at the end of the second line of a long duty in the open conversation's heading, which shows the whole
  // duty, and the same press once it is open, which shows two lines again: TheFoldedDuty in
  // src/web/components/ChatDuty.tsx (wave 13y round 113).
  'chat.duty.more': 'more',
  'chat.duty.less': 'less',
  // The office map's own settings, folded into its row under Tools, Plugins on the Settings page: OfficeMapSettings in
  // src/web/components/PluginSwitches.tsx (wave 13y round 119). The fold's name, what is read while it is read, the
  // switch's name, the two sentences that say the stored state, and why the switch cannot be pressed.
  'settingsPanel.plugins.officeMap.settings': 'Office map settings',
  'settingsPanel.plugins.officeMap.loading': "the office map's settings",
  'settingsPanel.plugins.officeMap.motion': 'Motion on the office map',
  'settingsPanel.plugins.officeMap.moves': 'The office map may move. A browser that asks for less motion still tells it to keep still.',
  'settingsPanel.plugins.officeMap.still': 'The office map is told to keep still, in every browser.',
  'settingsPanel.plugins.officeMap.notYours': 'Only the person, or a secretary the person has authorized, can change whether the office map moves.',
  // Above the office map's frame when whether it may move could not be read; {why} is the failure: PluginFrame in
  // src/web/pages/PluginPage.tsx (wave 13y round 119).
  'pluginPage.officeMap.unread': 'Whether the office map may move could not be read, so it is told to keep still: {why}',
  // The name of each thing Agents at work can find missing, by the code working.ts sends: the list under "Why this is
  // empty" in src/web/pages/WorkingPage.tsx (wave 13y round 121).
  'g6a.working.absence.registeredAgent': 'Registered agents',
  'g6a.working.absence.assignableAgent': 'Agents free for new work',
  'g6a.working.absence.statedWork': 'Stated work',
  'g6a.working.absence.openDomain': 'Open work domains',
  // What a backup is, in one line, at the top of the What is kept panel in src/web/components/WhatIsKept.tsx. The full
  // sentences, settingsPanel.kept.whatABackupIs, are drawn under it in developer mode only (wave 13y round 121).
  'settingsPanel.kept.backupInShort': 'A backup: a full copy of the office database and its files, to restore from.',
  // Round 124, item 61: the recipient slot under a comment, when the reply could not say who it is.
  'review.pane.row.recipientNotKnown': 'Recipient not known',
  // WAVE 13Y ROUND 125, ITEM 62: Settings in layout A, and the three panels that became pages of their own.
  get 'settingsPanel.title.arrangesidebar'(): string { return SURFACES['settings.arrangesidebar'] },
  'settingsCats.arrangeSidebar.what': 'Which pages it shows, in which groups and order',
  // The list's names for the two categories under its Developer heading, which already says "Developer".
  'settingsCats.list.devRuns': 'Agents and runs',
  'settingsCats.list.devMachines': 'Computers and access',
  'nav.what.gates': 'The office’s checks, limits and permissions that decide whether work moves.',
  'nav.what.officeControls': 'The values the office runs by, and the presses that change them.',
  // Gates and the sidebar's arrangement open as a reading; these two presses lead to their controls and back.
  'pagesFromSettings.edit': 'Edit',
  'pagesFromSettings.stopEditing': 'Stop editing',
  // Round 128, item 65: what an empty state's dash says, as its hover and to a screen reader.
  'g7a.work.none': 'No work is filed in any project.',
  'g7a.modules.none': 'No module in this project.',
  'g8.shelf.noOpenPlan': 'No open plan.',
  'g8.shelf.noEndedPlan': 'No ended plan.',
  'g8.graph.nothingDrawn': 'Nothing to draw for this project in this period.',
  'g7b.PipelinePage.it_has_no_step': 'It has no step.',
  // Round 136, item 79: who takes the usage notices of the sandboxes' login, and what the notice at 80% says to do.
  // The readings of the two settings say these. A notice that goes to the first secretary appointed, because the agent
  // chosen cannot take it, ends with the reading's own sentence.
  'usageNotices.secretary.setHere': '{who} takes the usage notices, as chosen here.',
  'usageNotices.secretary.firstAppointed': 'No secretary is chosen here, so {who} takes the usage notices as the first secretary appointed.',
  'usageNotices.secretary.noSecretary': 'No secretary is chosen here, and this office has no secretary, so no usage notice is sent.',
  'usageNotices.secretary.chosenRetired': '{chosen} was chosen here to take the usage notices and is retired, so {who} takes them as the first secretary appointed.',
  'usageNotices.secretary.chosenNotASecretary': '{chosen} was chosen here to take the usage notices and is no longer a secretary, so {who} takes them as the first secretary appointed.',
  'usageNotices.secretary.chosenNotRegistered': '{chosen} was chosen here to take the usage notices and is not a registered agent here, so {who} takes them as the first secretary appointed.',
  'usageNotices.secretary.chosenAndNoSecretary': '{chosen} was chosen here to take the usage notices and cannot take them now, and this office has no other secretary, so no usage notice is sent.',
  'usageNotices.decision.setHere': 'At 80%, the notice says what the usage decision "{title}" says to do: {whatToDo}',
  'usageNotices.decision.notSet': 'No usage decision is set here, so at 80% the notice asks the secretary to ask the owner about the rest of the seven days.',
  // Round 137, item 79b: the two settings on the Settings page, one row each (src/web/components/UsageNotices.tsx). Each
  // row draws the sentence above that its reading says. No line on the Settings page is built on who or nobody (round
  // 121, item 56), so the row's name, the picker's first choice and the sentences above say what is chosen and what happens.
  get 'settingsPanel.title.usagenotices'(): string { return SURFACES['settings.usagenotices'] },
  'usageNotices.panel.loading': 'the usage-notice settings',
  'usageNotices.panel.what': "When the sandboxes' Claude login has used 50% or 80% of its seven days, the office writes a notice to one secretary. The notice at 80% also says what a usage decision says to do.",
  'usageNotices.panel.who': 'The secretary for the notices',
  'usageNotices.panel.pick': 'Secretary',
  'usageNotices.panel.pickNobody': 'The first secretary appointed',
  'usageNotices.panel.save': 'Save',
  'usageNotices.panel.whatToDo': 'What the notice at 80% says to do',
  'usageNotices.panel.words': 'Words from the usage decision',
  'usageNotices.panel.wordsHint': 'The notice shows these words on a line of their own, exactly as written here.',
  'usageNotices.panel.decision': 'The usage decision the words come from',
  'usageNotices.panel.clear': 'Set nothing',
  'usageNotices.panel.openDecision': 'Open the usage decision',
  'usageNotices.panel.because': 'Reason given: {because}',
  // Round 140, item 79d: the decision is chosen from the newest ten, with ten more on each press, or found by its title
  // with the record picker. Their Chinese waits for the language line.
  'usageNotices.panel.chosen': 'Chosen: {title}',
  'usageNotices.panel.noneChosen': 'No decision is chosen yet.',
  'usageNotices.panel.newest': 'The newest decisions, in every project',
  'usageNotices.panel.loadingDecisions': 'the newest decisions',
  'usageNotices.panel.noDecisions': 'No decision is listed. The office has none, or a later decision replaced each one.',
  'usageNotices.panel.choose': 'Choose',
  'usageNotices.panel.chosenPress': 'Chosen',
  'usageNotices.panel.more': 'Show {n} more',
  'usageNotices.panel.find': 'Find an older decision by a word of its title',
  // Round 138, item 74: the report a new office files when its person gives their name, and its checklist item
  // (src/server/lib/getting-started.ts). The report is filed in a language only when that language holds every one of
  // these words (src/shared/getting-started.ts), so a new one here goes on that list too.
  'gettingStarted.report.title': 'Getting started: where the Embassy is, and how you let an agent in',
  'gettingStarted.report.welcome.heading': 'Welcome, {name}',
  'gettingStarted.report.welcome.text':
    'Mole Office filed this report when you gave your name. It shows two things to know first: where the Embassy is, and how you let an agent in.',
  'gettingStarted.report.embassy.heading': 'Where the Embassy is',
  'gettingStarted.report.embassy.text':
    'The Embassy is a page in the list on the left, under the name "{embassy}". On a narrow screen, the list opens from the "{menu}" button at the top. An agent that asks to work in your office waits there for your answer.',
  'gettingStarted.report.embassy.alt': 'The list on the left of a made-up office, with the Embassy in it.',
  'gettingStarted.report.admit.heading': 'How you let an agent in',
  'gettingStarted.report.admit.text':
    'Each agent that asks has its own row at the Embassy. The row says who it is, which card it asks for, and which computer it asked from. Press "{admit}" to let it in with that card. Press "{refuse}" to turn it away; the office asks you once more first, because that answer is final.',
  'gettingStarted.report.admit.alt': 'One made-up agent asking at the Embassy, with the presses that answer it.',
  'gettingStarted.report.stays.heading': 'This report stays on your checklist',
  'gettingStarted.report.stays.text':
    'The office put this report on your checklist, at the top right of every page. It stays there until you ask an agent to take it off.',
  'gettingStarted.report.madeUp': 'A picture of a made-up office. Every name in it is made up.',
  'gettingStarted.checklist.title': 'Getting started',
  'gettingStarted.item.words': 'Read this report: {report}. It shows where the Embassy is and how you let an agent in.',
  // Round 138, item 74: the two steps of a new office's first entry (src/web/lib/first-entry.tsx).
  'firstEntry.label': 'Getting started',
  'firstEntry.chat.title': 'This is the chat',
  'firstEntry.chat.text': 'Your agents write to you here, and you answer them here. No buttons need pressing.',
  'firstEntry.next': 'Next',
  'firstEntry.checklist.title': 'This is your checklist',
  'firstEntry.checklist.text': 'Open it, then press the name of the report in it. The report shows where the Embassy is and how you let an agent in.',
  'firstEntry.checklist.switchedOn':
    'The checklist was switched off on this computer. It is on now, and you can switch it off again on the Checklists page.',
  'firstEntry.failed': 'The office could not write down that you opened the report, so these steps will show again next time. What it said: {why}',
  'firstEntry.close': 'Close',
  // Round 142, item 66: Agent use's last lifecycle row and the line that says why a piece of work ended (src/web/pages/UsagePage.tsx).
  'dev.usage.notShownOnThisPageYet': 'not shown on this page yet',
  'dev.usage.theRequestLogHoldsThisTimeBut': 'The request log holds this time, but this page does not read it yet.',
  'dev.usage.whyItEnded': 'Why it ended: {why}',
  // Round 142, item 66: an empty group of a usage receipt says why it has no rows (src/web/components/UsageReceipt.tsx).
  'devWords.receipt.noRunCounted': 'No run was counted, so this group has no rows.',
  // Round 142, item 69: Sessions' tool tag, its release press's error, its unreadable panel, an unclaimed process's numbers and the note
  // about rows with no mark (src/web/components/SessionPanel.tsx, src/web/pages/SessionsPage.tsx).
  'g6a.sessions.noToolRecorded': 'no tool recorded',
  'g6a.sessions.theReleasePressFailed': 'The release press failed. Read the machine again before you press again.',
  'g6a.sessions.fromTheSessionsListAndTheMachineSweep': 'from the sessions list and the machine sweep',
  'g6a.sessions.itsPid': ' · pid {pid}',
  'g6a.sessions.itsProcessGroup': ', process group {pgid}',
  'g6a.sessions.filedKind': 'filed {kind}',
  // Round 157, item 99: the ended band's sentences and the folded-ended line, said plainly at one and at all
  // (src/web/components/SessionPanel.tsx, src/web/pages/SessionsPage.tsx).
  'g6a.sessions.itWasWrittenDownAsFinished': 'It was written down as finished.',
  'g6a.sessions.bothSayTheSameThing': 'Both say the same thing: ',
  'g6a.sessions.allSayTheSameThing': 'All {n} say the same thing: ',
  'g6a.sessions.foldedEndedNoGroups': '{n} ended or unconfirmed.',
  // Round 146: another writer changed the record while the person wrote in it. The line above
  // the edit form and the question on save (src/web/components/AnotherWriter.tsx).
  'record.anotherWriter.line': '{who} changed this record {when}, after you started editing. What you typed here stays as it is.',
  'record.anotherWriter.couldNotHear': 'Whether somebody else changed this record could not be read',
  'record.anotherWriter.see': 'See their version',
  'record.anotherWriter.hide': 'Hide their version',
  'record.anotherWriter.noComparison':
    "The record's history holds no version with what this form was opened from, so the two cannot be compared.",
  'record.anotherWriter.question': 'This record changed after you opened it',
  'record.anotherWriter.who': '{who} changed it {when}. Your change is not saved yet.',
  'record.anotherWriter.saveMineMeans':
    "Save mine puts your change on their version. Where you both changed the same thing, yours replaces theirs, and theirs stays in the record's history.",
  'record.anotherWriter.keepTheirsMeans': 'Keep theirs drops your change and shows their version.',
  'record.anotherWriter.notNow': 'Back to the form',
  'record.anotherWriter.keepTheirs': 'Keep theirs',
  'record.anotherWriter.saveMine': 'Save mine',
  // Round 156, item 98: the question shows the person's changed fields beside the other writer's version, so
  // the choice can be made without going back to the form the question covers.
  'record.anotherWriter.yourChange': 'What you changed',
  'record.anotherWriter.theirChange': 'What they changed',
  'record.anotherWriter.yours': 'Yours',
  'record.anotherWriter.theirs': 'Theirs',
  'record.anotherWriter.removed': 'removed',
  'record.anotherWriter.notThere': 'not there',
  // The words of the page's language did not reach the page (src/web/lib/the-words-that-did-not-come.tsx),
  // and the developer counts on the Settings page wait for every language's words (src/web/components/WordCheckPanel.tsx).
  'language.wordsDidNotCome': 'The {language} words did not reach this page, so it is drawn in {shown}.',
  'language.wordsNotCounted': 'The {language} words did not reach this page, so the words each language is missing cannot be counted.',
  'language.everyLanguagesWords': "every language's words",

  // Round 146: the review as a tray at the foot of the window, its presses, and the row a removed comment leaves
  // (src/web/components/agent/ReviewBar.tsx).
  'review.tray.show': 'Show comments',
  'review.tray.hide': 'Hide comments',
  'review.tray.send': 'Send review',
  'review.tray.close': 'Close',
  'review.tray.removed': 'Removed',
  // Round 146: what a comment's mark does once the comment is sent, on Settings' Review marks panel
  // (src/web/components/agent/SentMarksChoice.tsx).
  'review.sentMarks.ask': 'Marks of comments once sent',
  'review.sentMarks.show': 'Keep showing them',
  'review.sentMarks.hide': 'Hide them completely',
  'review.sentMarks.unsentAlways': 'A comment you have not sent still shows its mark, whatever this choice says.',
  // Round 153, the decision of 8 November 2026: the pin that keeps the comment box open, and the words that
  // keep a half-written comment from looking like a sent one (src/web/components/agent/TalkBox.tsx,
  // src/web/components/agent/SavedComment.tsx).
  'talk.pin': 'Pin this box open',
  'talk.unpin': 'Stop keeping this box open',
  'talk.pinTitle': 'Keep this open while you click elsewhere',
  'talk.unpinTitle': 'Close this when you click elsewhere',
  'talk.notSentYet': 'Not sent yet',
  'savedComment.notSent': 'Not sent',
  // Round 164: the notices an inside package's doors write, to its maker and to the supervisor that took it
  // (src/server/lib/delegation.ts).
  'noticeWords.packageTaken': 'It tells the maker of an inside package who took the package inside.',
  'noticeWords.packageAligned': 'It asks the maker of an inside package to answer how the one that took it restated it.',
  'noticeWords.packageAlignAnswered': 'It tells the one that took an inside package how its restatement was answered.',
  'noticeWords.packageHandedBack': 'It tells the maker of an inside package that the package was handed back, point by point.',
  'delegation.notice.takenTitle': 'Your package "{title}" was taken inside',
  'delegation.notice.takenBody': '{who} took your package "{title}" (task {task}) inside.',
  'delegation.notice.alignedTitle': 'Your package "{title}" waits for your answer',
  'delegation.notice.alignedBody': '{who} restated your package "{title}" (task {task}). Restated: "{restated}" Plan: "{plan}" Answer aligned or differs at POST /api/delegation/{task}/align-answer.',
  'delegation.notice.answeredTitle': 'Your restatement of "{title}" was answered',
  'delegation.notice.answeredBody': '{who} answered your restatement of "{title}" (task {task}): {answer}, with the words "{words}".',
  'delegation.notice.handedBackTitle': 'Your package "{title}" was handed back',
  'delegation.notice.handedBackBody': '{who} handed back your package "{title}" (task {task}). {points}',
  'delegation.notice.handedBackPoint': 'Point {point}: {outcome}, with the words "{words}".',
  'delegation.notice.outcome.done': 'done',
  'delegation.notice.outcome.part': 'part done',
  'delegation.notice.outcome.not': 'not done',
  'delegation.notice.noTaker': 'The one that took the package inside is stored as "{who}", and that names no one agent.',
  'delegation.notice.noMaker': 'The maker of the package is stored as "{who}", and that names no one agent.',
  // Round 166: the maker's answer to a hand-back, point by point, told to the one that took the package
  // (acceptThePackage in src/server/lib/delegation.ts).
  'noticeWords.packageAccepted': 'It tells the one that took an inside package which of its points the maker accepted.',
  'noticeWords.packageReturned': 'It tells the one that took an inside package which of its points the maker sent back, and why.',
  'delegation.notice.acceptedTitle': 'Points of your package "{title}" were accepted',
  'delegation.notice.returnedTitle': 'Points of your package "{title}" were sent back to you',
  'delegation.notice.acceptanceBody': '{who} answered your hand-back of "{title}" (task {task}). {points} {standing}',
  'delegation.notice.acceptedPoint': 'Point {point}: accepted.',
  'delegation.notice.returnedPoint': 'Point {point}: sent back, with the words "{words}".',
  'delegation.notice.everyPointAccepted': 'Every point is accepted, so the package is done.',
  'delegation.notice.handTheReturnedBack': 'Hand the returned points back again at POST /api/delegation/{task}/hand-back.',
  'delegation.notice.pointsWait': {
    one: '{n} point is not answered yet.',
    other: '{n} points are not answered yet.',
  },
  // Round 166: what a package door says of a second act it records instead of refusing, in its reply and its notice
  // (the take, restate, answer, hand-back and check doors in src/server/lib/delegation.ts).
  'delegation.reminder.takenAgain': '{who} had already taken this package inside, at {at}. This take is recorded as the newest. Only the newest taker may restate it or hand it back.',
  'delegation.notice.takenAfterYouTitle': 'The package "{title}" you took inside was taken again',
  'delegation.notice.takenAfterYouBody': '{who} took the package "{title}" (task {task}) inside after you.',
  'delegation.reminder.restatedWhileWaiting': 'The restatement of {at} had no answer yet. This one is recorded as the newest, and an answer now answers this one.',
  'delegation.reminder.restatedAfterAligned': 'The restatement of {at} was already aligned. This one is recorded as the newest, so the package is taken again until this one is answered.',
  'delegation.reminder.answeredAgain': 'The newest restatement already had an answer, at {at}. This answer is recorded as the newest, and it is the one that counts.',
  'delegation.reminder.handedBackUnaligned': 'The plan of this package was not aligned before this hand-back. The hand-back is recorded, and the maker decides whether to accept its points.',
  'delegation.reminder.checkedAgain': 'This hand-back was already checked, at {at}. This check is recorded as the newest.',
  // Round 166: the field of a package that holds these answers (src/shared/kinds.ts).
  'record.field.acceptances': 'Acceptances',
  // Round 166: the six states of a package, read from PACKAGE_STATE_WORDS so each is spelled once (src/shared/words.ts).
  get 'word.packageState.to_do'(): string { return englishWord('word.packageState.to_do') },
  get 'word.packageState.done'(): string { return englishWord('word.packageState.done') },
  // Round 166: the progress card's count of briefs whose maker sent points back (src/web/components/ProgressCard.tsx).
  'progressCard.returned': 'Returned',
  // Round 164: why the seal line about a run goes to nobody (whoIsToldOfASealOnceAPackageMoves in src/server/lib/delegation.ts).
  'delegation.seal.nobodyTold': 'No starter was told of this seal. The run handed back the inside package "{title}" (task {task}), and {agent}, whose run it is, took that package inside. The seal line would have gone to {agent}, and its words are for the run\'s starter.',
  // The sidebar's words and the All pages page's words.
  get 'nav.allPages'(): string { return SURFACES['rail.allpages'] },
  'nav.allPages.count': '{n} pages',
  'nav.allPages.what': 'Every page of the office, found by its name',
  // All pages' search, and the line that says it found nothing.
  'allPages.find': 'Find a page…',
  'allPages.none': 'No page has “{words}” in its name.',
  // The quick search over every page (src/web/components/QuickSearch.tsx), its sidebar press and its key.
  get 'nav.quickSearch'(): string { return SURFACES['rail.quicksearch'] },
  'shortcuts.what.quickSearch': 'Open the quick search',
  'quickSearch.find': 'Paste an id, or type a name…',
  'quickSearch.pages': 'Pages',
  'quickSearch.records': 'Records in this project',
  'quickSearch.unknownId': 'No record has the id {id}.',
  'quickSearch.none': 'No page or record has “{words}” in its name.',
  'quickSearch.more': 'More records have these words in their names. Type more words to narrow them.',
  'quickSearch.failed': 'The records could not be searched: {error}',
  'quickSearch.close': 'Close the quick search',
  // The pages each person pins in front of the sidebar, on All pages and on the arrangement page.
  'pins.title': 'Your pages in front',
  'pins.pin': 'Pin',
  'pins.unpin': 'Unpin',
  'pins.pinPage': 'Pin {page} in front of the sidebar',
  'pins.unpinPage': 'Unpin {page} from the front of the sidebar',
  'pins.upPage': 'Move {page} up among your pinned pages',
  'pins.downPage': 'Move {page} down among your pinned pages',
  'pins.first': 'This page is already first in front.',
  'pins.last': 'This page is already last in front.',
  'pins.busy': 'Wait until your pinned pages are kept.',
  'pins.unreadable': 'Your pinned pages are kept in a form Mole Office cannot read, so the pages it comes with stand in front. Pinning or unpinning a page keeps a new list.',
  'pins.readFailed': 'Your pinned pages could not be read, so the pages Mole Office comes with stand in front.',
  // The pages of the project each person pins in the sidebar's project block, on All pages and on the arrangement page.
  'pins.projectTitle': 'Your pages under the project',
  'pins.pinProjectPage': 'Pin {page} under the project in the sidebar',
  'pins.unpinProjectPage': 'Unpin {page} from the project in the sidebar',
  'pins.firstUnderProject': 'This page is already first under the project.',
  'pins.lastUnderProject': 'This page is already last under the project.',
  // The records count line, when a kind and a group are both chosen: one sentence for the two.
  'records.onlyKindInGroup': 'Showing only “{kind}” in the group “{group}”.',
  // The package panel's state, which the tasks page draws for the same package.
  'tpp.state': 'state',
  // Who is responsible for a package, or holds it, when the registries could not be read to name them.
  'tpp.nameNotRead.agent': 'an agent whose name could not be read',
  'tpp.nameNotRead.person': 'a person whose name could not be read',
  'g7b.PipelinePage.pipeline_on_file': 'pipeline on file',
  'chat.chooseConversation': 'Select a conversation.',
  // The short mark under a chat message whose addressee could not be reached (src/web/components/RoutedLine.tsx).
  'chat.notDelivered': 'Not delivered',
  // The short word the flag left of Send shows for the chosen mark. "No mark" shows no word.
  'chat.intent.short.justAsk': 'Ask',
  'chat.intent.short.proposalFirst': 'Plan',
  // A person's own labels: the Settings panel in src/web/components/ChatLabelsPanel.tsx, and their lines in the flag's list.
  get 'settingsPanel.title.chatlabels'(): string { return SURFACES['settings.chatlabels'] },
  'settingsPanel.chatLabels.what': 'Words of your own to put on a message. The flag left of Send lists them after its three marks. The agent reads the word with your message.',
  'settingsPanel.chatLabels.none': 'You have no labels yet.',
  'settingsPanel.chatLabels.loading': 'your labels',
  'settingsPanel.chatLabels.list': 'Your labels',
  'settingsPanel.chatLabels.new': 'A new label',
  'settingsPanel.chatLabels.word': 'Word',
  'settingsPanel.chatLabels.colour': 'Colour',
  'settingsPanel.chatLabels.add': 'Add',
  'settingsPanel.chatLabels.save': 'Save',
  'settingsPanel.chatLabels.remove': 'Remove',
  'settingsPanel.chatLabels.colour.grey': 'Grey',
  'settingsPanel.chatLabels.colour.red': 'Red',
  'settingsPanel.chatLabels.colour.amber': 'Amber',
  'settingsPanel.chatLabels.colour.green': 'Green',
  'settingsPanel.chatLabels.colour.blue': 'Blue',
  'settingsPanel.chatLabels.colour.purple': 'Purple',
  'settingsPanel.chatLabels.added': 'Added “{word}”.',
  'settingsPanel.chatLabels.saved': 'Saved “{word}”.',
  'settingsPanel.chatLabels.removed': 'Removed “{word}”.',
  'settingsPanel.chatLabels.noWord': 'Type a word first.',
  'settingsPanel.chatLabels.noColour': 'Choose a colour first.',
  'settingsPanel.chatLabels.unreadable': 'The labels the office keeps cannot be read by this version. Adding a label replaces the list it keeps.',
  'settingsPanel.chatLabels.unreadableNotText': 'The labels kept for this person are not stored as text, so they cannot be read.',
  'settingsPanel.chatLabels.unreadableNotJson': 'The labels kept for this person are not written as JSON, so they cannot be read.',
  'chat.label.selectorNow': 'Your label: {word}',
  // The title of a message's label field on its record page. Its Chinese waits for the translation round.
  'record.section.label': 'Label',
  // The quick note, a kind of its own (src/shared/kinds/quick-note.ts): its name, and the title of its one field the
  // other kinds have no word for.
  get 'kind.quick_note'(): string { return englishWord('kind.quick_note') },
  'record.section.from_page': 'From page',
  // A QUICK NOTE: its page (src/web/pages/QuickNotePage.tsx), the note itself (src/web/components/QuickNote.tsx) and its
  // sheet (src/web/components/QuickNoteSheet.tsx). The placeholder and the words of the foot are the drawing's own words.
  'quickNote.title': 'Quick note',
  'quickNote.newNote': 'New note',
  'quickNote.untitled': 'A note with no words',
  'quickNote.untitledInSentence': 'the note with no words',
  'quickNote.back': 'Back',
  'quickNote.done': 'Done',
  'quickNote.tools': 'Drawing tools',
  'quickNote.pen': 'Pen',
  'quickNote.eraser': 'Eraser',
  'quickNote.colour': 'Colour of the pen',
  'quickNote.colour.ink': 'Ink',
  'quickNote.colour.red': 'Red',
  'quickNote.colour.blue': 'Blue',
  'quickNote.undo': 'Undo',
  'quickNote.sheet': 'The note. Write or draw anywhere on it.',
  'quickNote.placeholder': 'Write or draw anywhere on this sheet.',
  'quickNote.words': 'Words in the note',
  'quickNote.boxWords': 'Words in the box',
  'quickNote.resizeBox': 'Resize box',
  'quickNote.zoomOut': 'Zoom out',
  'quickNote.resetZoom': 'Reset zoom',
  'quickNote.zoomIn': 'Zoom in',
  'quickNote.moveSheet': 'Move sheet',
  'quickNote.myNotes': 'My notes',
  'quickNote.keptIn': 'Kept in {myNotes}',
  'quickNote.notKeptYet': 'Kept in {myNotes} as soon as you write or draw.',
  'quickNote.writtenFrom': 'Written from the office page: {page}',
  'quickNote.saving': 'Saving…',
  'quickNote.saved': 'Saved {time}',
  'quickNote.notSaved': 'Not saved: {reason}',
  'quickNote.saveAgain': 'Save again',
  'quickNote.changedElsewhere': 'This note was changed somewhere else after this page last saved it, so this page has stopped saving it.',
  'quickNote.keepThisPage': 'Keep what this page shows',
  'quickNote.showTheKept': 'Show the saved note',
  'quickNote.reading': 'Reading the note…',
  'quickNote.notANote': 'This record is not a quick note.',
  'quickNote.openItsPage': 'Open it on its own page',
  'quickNote.picture.storing': 'Storing {name}…',
  'quickNote.addedFrom': 'Added from',
  // The box and line tools of the note, and a picture or a film pasted, dropped or chosen into it
  // (src/web/components/quick-note-files.ts). A refusal names the file and then says why in a sentence of its own.
  'quickNote.box': 'Box',
  'quickNote.line': 'Line',
  'quickNote.addAPicture': 'Add a picture',
  'quickNote.picture.adding': 'Adding {name}…',
  'quickNote.picture.refused': '{name} was not added. {reason}',
  'quickNote.picture.notAPictureOrFilm': 'It is not a picture or a film.',
  'quickNote.picture.unreadable': 'This browser could not open it as a picture or a film.',
  'quickNote.picture.tooBig': 'It is {size}, and the office keeps a file of at most {most}.',
  'quickNote.picture.notAFilmFormat': 'A film is kept only as a {endings} file.',
  // My notes, the page of every quick note: src/web/pages/MyNotesPage.tsx.
  get 'myNotes.title'(): string { return SURFACES['rail.mynotes'] },
  'myNotes.loading': 'your notes',
  'myNotes.none': 'There is no note yet. Every note you write is listed here, whichever project it is in.',
  'myNotes.noneHoldIt': 'No note holds these words.',
  'myNotes.noneOfThisChoice': 'No note that holds these words is of this choice.',
  'myNotes.search': 'Search my notes',
  'myNotes.choices': 'Which notes to show',
  'myNotes.choice.all': 'All',
  'myNotes.choice.fromAPage': 'From an office page',
  'myNotes.choice.drawn': 'With a drawing',
  'myNotes.thisWeek': 'This week',
  'myNotes.lastWeek': 'Last week',
  'myNotes.weekOf': 'The week of {day}',
  'myNotes.drawing': 'The note’s drawing, small',
  'messagePages.moreOffers': 'Show more offers',
  'messagePages.moreAgents': 'Show more agents',
  'messagePages.olderMessages': 'Show older messages',
  'myNotes.pictures': { one: '{n} picture', other: '{n} pictures' },
  'myNotes.videos': { one: '{n} film', other: '{n} films' },
  'myNotes.added': { one: '{n} thing added from a page', other: '{n} things added from pages' },
  'myNotes.writtenFrom': 'Written from the office page:',
  'myNotes.startedOnNoPage': 'Not started from an office page',
  'myNotes.more': 'Show more notes',
  'myNotes.move': 'Move to a project',
  'myNotes.projectsNotHereYet': 'The office has not sent the list of projects yet.',
  'myNotes.moveTo': 'Choose the project',
  'myNotes.moveNow': 'Move',
  'myNotes.cancel': 'Cancel',
  'myNotes.notMoved': 'The note was not moved.',
  // My notes' row in the sidebar (src/web/components/Sidebar.tsx).
  'nav.what.myNotes': 'Every quick note you wrote, newest first, and the search over them.',
  // The sidebar's press that opens a new quick note (src/web/lib/open-a-quick-note.ts), and the note beside the page
  // when the browser blocks its window (src/web/components/QuickNoteBeside.tsx).
  get 'nav.newNote'(): string { return SURFACES['rail.quicknote'] },
  'quickNotes.windowWasBlocked': 'The browser blocked the window, so your note stayed here.',
  'quickNotes.popOut': 'Open in a window',
  'quickNote.returnFailed': 'The office window did not answer, so the note stayed open. Try Back again.',
  // Send with Note chosen in the right-click box (src/web/components/agent/TalkBox.tsx, src/web/lib/add-to-a-note.ts).
  'talk.addToNote.reading': 'Finding the note you last wrote in.',
  'talk.addToNote.adding': 'Adding it now.',
  'talk.addedToNote': 'Added to {name}.',
  'talk.addedToANewNote': 'Added to a new note.',
  'talk.addToNote.open': 'Open the note',
  'talk.addToNote.changedElsewhere': 'Nothing was added, because the note was changed somewhere else just then. Try again.',
  'talk.sendTo': 'Send to',
  'talk.sendTo.contact': 'Contact',
  'talk.sendTo.note': 'Note',
  'talk.note.new': 'New note',
  'talk.notes': 'Your notes',
  'talk.note.left': {
    one: '{n} older note is not listed. My notes lists every note.',
    other: '{n} older notes are not listed. My notes lists every note.',
  },
  'talk.note.choose': 'Choose a note',
  'talk.note.chooseFirst': 'Choose a note first.',
  'talk.note.lastNotRead': 'The office could not say which note you last wrote in, so no note is chosen.',
  'talk.notes.notRead': 'Your notes could not be read. New note can still be chosen.',
  'talk.note.nothingAdded': 'Nothing was added to the note.',
  // The words beside a contact the right-click box's list puts first (src/web/components/agent/TalkBox.tsx).
  'talk.contacts.submittedThisRecord': 'submitted this record',
  'talk.contacts.thisProjectsSecretary': "this project's secretary",
  'talk.contacts.secretariesNotRead': "This project's secretaries could not be read, so none is put first.",
  // The positions of quotes in a message and the reasons a position is refused.
  'record.field.quotePositions': 'Quote positions',
  'agent.quote.from': 'QUOTE FROM {source}:',
  'agent.quote.fromField': 'QUOTE FROM {source}, field {field}:',
  'agent.quote.empty': 'QUOTE FROM {source}, no words chosen.',
  'agent.quote.end': 'END QUOTE',
  'server.messageQuotePositionsInvalid': 'The quote positions are not valid. Nothing was saved.',
  'server.quotePositions.needsQuotes': 'Quote positions need a list of quotes.',
  'server.quotePositions.withTarget': 'A message with a target cannot have quote positions.',
  'server.quotePositions.list': 'Quote positions must be a list.',
  'server.quotePositions.count': 'Send one quote position for each quote.',
  'server.quotePositions.range': 'Each quote position must be a whole number within the message body.',
  'server.quotePositions.order': 'Quote positions must be in order.',
  'server.quotePositions.character': 'A quote position cannot split a character.',
  // Item CG-1, round 170: a comment addressed to an agent or a run in another project says who and where it is
  // addressed to, and nothing about the conversation belonging to a project. The server keeps the where and here
  // facts it always sent; these words use the first two.
  'sendPlan.line.agentInAnotherProject': 'This comment cannot go because {title} is in {where}.',
  'review.delivery.otherProject': 'This comment cannot go because {title} is in {where}.',
  'review.delivery.noRecipient': 'This comment cannot go because no recipient is known.',
  'review.delivery.missingAgent': 'This comment cannot go because the chosen agent is no longer available.',
  'review.delivery.wrongAgent': 'This comment cannot go because its recipient is not an agent.',
  'review.delivery.retired': 'This comment cannot go because the chosen agent has retired.',
  'review.delivery.missingRun': 'This comment cannot go because its chosen run is unavailable.',
  'review.delivery.wrongRun': 'This comment cannot go because its recipient is not a run.',
  'review.delivery.otherRun': 'This comment cannot go because its chosen run is in another project.',
  'review.delivery.noPickup': 'This comment cannot go because its chosen run cannot be resumed.',
  'review.delivery.waiting': 'Waiting for comments to be sent',
  'review.delivery.choose': 'Choose another recipient',
  'review.delivery.move': 'Move agent into this project',
  'review.delivery.finding': 'Finding the agent’s project…',
  'review.delivery.notFound': 'The agent’s project could not be identified.',
  'review.delivery.ambiguousProject': 'The agent does not have exactly one other project to move from. Choose another recipient or inspect the agent’s projects.',
  'review.delivery.recoveryStarter': 'Only the person or agent who started this review may recover its unsent comments. Nothing was changed.',
  'review.delivery.recoveryQueue': 'This review conversation has other messages waiting. Resolve those messages before recovering this review. Nothing was changed.',
  'review.delivery.recoveryChanged': 'The review or its recipients changed while it was being recovered. Nothing was changed by this press; read it again.',
  'review.delivery.recoveryHanded': 'A comment has already been handed over. Read the review again before recovering it. Nothing was changed.',
  'review.delivery.recoveryWords': 'The waiting message and its original comments no longer have the same words. They are still saved; review the message before sending it elsewhere.',
  'review.delivery.recoveryShared': 'This waiting message holds other comments too. Send the shared comments together; nothing was changed.',
  'review.delivery.sessionMove': 'Moving the agent alone may leave this run in its original project. After moving, choose the agent as the recipient; moving it does not make this run deliverable.',
  'review.delivery.recoveryAll': 'This older review can be recovered only when every remaining comment can go together. Resolve the remaining comments first. Nothing was changed.',
  'review.delivery.sharedMessage': 'If this comment shares a waiting message with others, the new recipient applies to all of them.',
  'review.delivery.unresolved': 'This comment cannot go because its recipient could not be identified: {why}',
  'review.delivery.unresolvedSaid': 'This comment cannot go because {said} did not identify one recipient.',
  'review.delivery.unresolvedSaidWhy': 'This comment cannot go because {said} did not identify one recipient: {why}',
  'review.delivery.noneSent': 'No comments were sent.',
  'review.delivery.stillWaiting': ' This review is waiting for the comments that stayed behind.',
  'review.delivery.cannotChange': 'This comment cannot be addressed here.',
  'review.delivery.failed': 'The recipient could not be changed.',
  'sendPlan.line.runInAnotherProject': 'It is addressed to "{title}", which is a run in "{where}".',
  // The one press that draws an attached HTML file inside the report, and the frame's own name
  // (src/web/components/SummaryBlocks.tsx).
  'sb.file.show': 'Show it here',
  'sb.file.frame': 'The file {name}, drawn inside this report',
  // A file too large to show whole, and the pages generated for a Word document or a text file
  // (src/server/api/files.ts and src/server/lib/word-document.ts).
  'sb.file.tooLargeToShow': 'This file is too large to show in the page. It is refused whole rather than cut, and Save reads all of it. The page shows files up to {limit} bytes.',
  'sb.word.notAWord': 'That file is not a Word document this office can read. Nothing of it was shown.',
  'sb.word.multiDisk': 'That Word document is in several pieces the office does not join. Nothing of it was shown.',
  'sb.word.zip64': 'That Word document uses a ZIP form this office does not read. Nothing of it was shown.',
  'sb.word.tooManyParts': 'That Word document has more parts than this office reads. Nothing of it was shown.',
  'sb.word.encrypted': 'That Word document is encrypted. The office does not ask for a password, so nothing of it was shown.',
  'sb.word.unfitPart': 'That Word document names a part in a way this office does not read. Nothing of it was shown.',
  'sb.word.tooMuchText': 'That Word document holds more words than the office reads at once. Nothing of it was shown.',
  'sb.word.definitionRefused': 'That Word document carries a definition this office will not read. Nothing of it was shown.',
  'sb.word.picturesLeftOut': 'Pictures in this file are not shown. This page shows the words, lists and tables only.',
  'sb.word.nothingToShow': 'This Word document has no words, lists or tables this office can show.',
  'sb.word.notText': 'That file is not text this office can read. Nothing of it was shown.',
  // The sign on a page that still draws the project just left, while the chosen project's answer is
  // read (src/web/components/ReReadStrip.tsx).
  'frameFiles.reread.anotherProject': 'Reading {project}…',
  'frameFiles.reread.anotherProjectKept': 'The dimmed page still shows the project you left.',
  // The two presses under a comment a review would otherwise wait for, what each press did, and why one is refused
  // (src/server/lib/reviews.ts, takeOutOfTheReview, and src/web/components/agent/ReviewBar.tsx).
  'review.takeOut.answerMyself': 'I answer this myself',
  'review.takeOut.remove': 'Remove from this review',
  'review.takeOut.yoursWhy': 'The review waits for this comment until you say you answer it yourself.',
  'review.takeOut.missingWhy': 'The review waits for this comment until you remove it.',
  'review.takeOut.answered': 'You answer this comment yourself. The review no longer waits for it, and the comment stays here.',
  'review.takeOut.removed': 'This comment is out of the review. Nothing was sent for it.',
  'review.takeOut.stillWaits': { one: ' This review still waits for {n} comment.', other: ' This review still waits for {n} comments.' },
  'review.takeOut.nothingWaits': ' Nothing else in this review waits to go, so it is marked sent.',
  'review.takeOut.collecting': 'This review is still collecting. Finish collecting before you take a comment out of it. Nothing was changed.',
  'review.takeOut.abandoned': 'This review was abandoned, so it waits for nothing. Nothing was changed.',
  'review.takeOut.notFrozen': 'This review has no record of the comments it holds, so no comment can be taken out of it. Nothing was changed.',
  'review.takeOut.notInIt': 'That comment is not in this review. Nothing was changed.',
  'review.takeOut.already': 'That comment was already taken out of this review. Nothing was changed.',
  'review.takeOut.gone': 'That comment has already gone, so the review does not wait for it. Nothing was changed.',
  'review.takeOut.notThePersons': '"I answer this myself" is for a comment only you may answer, and this one is not. Nothing was changed.',
  'review.takeOut.stillFound': '"Remove from this review" is for a comment that can no longer be found, and this one is still here. Nothing was changed.',
  'review.takeOut.starter': 'This review was already sent. Only the person or agent who started it may take a comment out of it. Nothing was changed.',
  'review.takeOut.notProved': 'This request did not prove it comes from the person or from somebody who may act for the owner. If you are using a browser, pair it first on the Pairing page (#/pairing). Nothing was changed.',
  'review.takeOut.failed': 'The comment could not be taken out of the review.',
  // The line under such a comment once it is taken out (src/shared/send-plan-words.ts).
  'sendPlan.line.answeredByThePerson': 'You said you answer this comment yourself. It stays here, and nothing was handed over for it.',
  'sendPlan.line.removedFromTheReview': 'This comment was taken out of the review because it can no longer be found. Nothing was sent for it.',
  // The plan's sentence for a review stored as sent that still has comments Send can send (src/shared/send-plan-words.ts).
  'sendPlan.plan.sentSomeLeft': 'This review was sent, and some of its comments did not go. Pressing Send sends what is left. ',
  // Beside a sent message's count of marked parts, how many of them cannot be painted where the words are drawn
  // (src/web/components/chat/MarkedWords.tsx).
  'chat.markedPartsNotShown': { one: '{n} is not shown in the words', other: '{n} are not shown in the words' },
} as const
