// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The English list's place for wave 13j's new words, in English only. Their Chinese is written in
// the translation round before a version, and until then a Chinese page shows the English. joined.ts reads this file.
import { ENTERED_STEP_DOES } from '../flow-run.ts'
import { PLAN_QUESTIONS, PLANNING_STEP_DOES } from '../planning-flow.ts'
import { englishWord } from '../words.ts'

export const enWave13j = {
  // A queued repeat names the new ask instead of asking somebody to start it again.
  'chk.says.checkFailed.askedAgain': 'The office queued another check as {message}.',
  // ---- w13j round 41: what waits for translation, on Settings in Developer mode ----
  'settings.words.waiting.title': 'Waiting for translation',
  'settings.words.waiting.asking': 'Asking the office which words wait for translation.',
  'settings.words.waiting.count': { one: '{n} word waits for its Chinese.', other: '{n} words wait for their Chinese.' },
  'settings.words.waiting.none': 'No word waits for its Chinese.',
  'settings.words.waiting.line': '{key}: {reason}',
  'settings.words.waiting.more': { one: 'And {n} more.', other: 'And {n} more.' },
  'settings.words.waiting.reason.noChinese': 'no translation yet',
  'settings.words.waiting.reason.englishChanged': 'its English changed after its translation was written',
  'settings.words.waiting.reason.nobodyRecorded': 'no record says which English its translation was made from',
  'settings.words.waiting.removed': { one: '{n} Chinese word was taken out. A test refuses that.', other: '{n} Chinese words were taken out. A test refuses that.' },
  // ---- w13j round 49: the flow for planning a big piece of work ----
  'server.planNotAModule': 'The planning flow runs on a module, and this record is not a module. Nothing was changed.',
  'server.planModuleNamesNoPlanner': 'This module names no planner, so nobody may say its plan step is done. Name the planner on the module first. Nothing was changed.',
  'server.planCallerIsNotThePlanner': 'Only the planner the module names may use this door. Nothing was changed.',
  'server.planNeedsARun': 'This door needs the run you are working in, and your request names none. Nothing was changed.',
  'server.planModuleHasNoPipeline': 'This module has no pipeline. Draw the pipeline and link it to the module, then say the plan step is done. Nothing was changed.',
  'server.planPipelineNotTheModules': 'That pipeline is not linked to this module. Nothing was changed.',
  'server.planChecklistNotThePlanners': 'That checklist is not the planner’s own in this project. Nothing was changed.',
  'server.planStepAlreadyDone': 'The plan step of this module is already done, and its plan has not been submitted yet. Nothing was changed.',
  'server.planNotOpen': 'No plan of this module waits to be submitted. Say the plan step is done first. Nothing was changed.',
  'server.planItemTickedByAnother': 'This item stands for a plan that waits to be questioned. Only the person or the module’s planner may tick it by hand. Nothing was changed.',
  'server.planWrittenOutsideItsDoors': 'A module’s planning is written only by the planning doors. Nothing was changed.',
  // The module page's planning panel. The four questions are the office's own words, read from one list.
  'record.section.planner': 'Planner',
  // A planning flow run's `module`: which module's plan it records.
  'record.section.module': 'Module',
  'record.section.planning': 'Planning',
  'w13j.planning.title': 'Planning',
  'w13j.planning.planner': 'Planner: {who}.',
  'w13j.planning.plannerLabel': 'Planner:',
  'w13j.planning.noPlanner': 'No planner is named on this module. Nobody can say its plan step is done until somebody is.',
  'w13j.planning.noStep': 'Nobody has said the plan step is done for this module.',
  'w13j.planning.stepDone': '{who} said the plan step was done {when}.',
  'w13j.planning.pipeline': 'Pipeline:',
  'w13j.planning.prompt': 'The office’s questions:',
  'w13j.planning.checklist': 'Checklist with the item:',
  'w13j.planning.flowRun': 'Flow run:',
  'w13j.planning.questioned': '{who} questioned the plan and submitted it {when}.',
  'w13j.planning.tickedByHand': '{who} ticked the checklist item by hand {when}. The plan was not questioned through the submit door.',
  'w13j.planning.waiting': 'The office waits for the planner to question the plan and submit it.',
  'w13j.planning.nobodyRecordedWho': 'Nobody recorded who',
  'w13j.planning.question.againstHisDecisions': PLAN_QUESTIONS.againstHisDecisions,
  'w13j.planning.question.alreadyDone': PLAN_QUESTIONS.alreadyDone,
  'w13j.planning.question.localFix': PLAN_QUESTIONS.localFix,
  'w13j.planning.question.leastSure': PLAN_QUESTIONS.leastSure,
  // A planning flow run's steps, as the flow-run page draws them. The office writes the same sentences into the steps.
  'w13j.planning.step.planStepDone': PLANNING_STEP_DOES.planStepDone,
  'w13j.planning.step.promptSent': PLANNING_STEP_DOES.promptSent,
  'w13j.planning.step.submitted': PLANNING_STEP_DOES.submitted,
  'w13j.planning.step.recorded': PLANNING_STEP_DOES.recorded,
  'w13j.planning.step.tickedByHand': PLANNING_STEP_DOES.tickedByHand,
  // ---- w13j round 51: the planning flow's first real use (report FRsTZ627KvQQ) ----
  'record.section.ended': 'Ended',
  'server.plannerNamedByAnother': 'Only the person, a secretary or the agent that made this module may name its planner. Nothing was changed.',
  // ---- w13j round 52: any flow an agent enters is on its checklist ----
  'server.flowNotAFlow': 'Only a flow record can be entered, and this record is not one. Nothing was changed.',
  'server.flowAboutNotHere': 'The record the flow would be about is not in this project. Nothing was changed.',
  'server.flowNeedsARun': 'Entering a flow needs the run it is entered from, and this request names none. Nothing was changed.',
  'server.flowRunServesNoAgent': 'That run names no agent the office knows, so there is no checklist to put the flow on. Nothing was changed.',
  'server.flowEnteredForAnother': 'Only the agent the run serves, or the person, may enter a flow for that run. Nothing was changed.',
  'server.flowEnteredByItsOwnDoor': 'The planning flow is entered by its own door, when the planner says the plan step is done. Nothing was changed.',
  'server.flowAlreadyEntered': 'This flow is already entered about this record from this run, and it has not ended. Nothing was changed.',
  'server.flowChecklistNotTheirs': 'That checklist is not the agent’s own in this project. Nothing was changed.',
  'server.flowItemTickedByAnother': 'This item stands for a flow that has not ended. Only the person or the agent whose checklist it is may tick it by hand. Nothing was changed.',
  'server.flowItemChangedByAnother': 'This item stands for a flow that has not ended. Until it ends, only the person or the agent in the flow may change it. Nothing was changed.',
  // A flow run's `entered`, and a flow's `ends_on`, as the record page names the fields.
  'record.section.entered': 'Entered',
  'record.section.ends_on': 'Ends on',
  // An entered flow run's steps, as the flow-run page draws them. The office writes the same sentences into the steps.
  'w13j.flowEntered.step.entered': ENTERED_STEP_DOES.entered,
  'w13j.flowEntered.step.endedByEvent': ENTERED_STEP_DOES.endedByEvent,
  'w13j.flowEntered.step.tickedByHand': ENTERED_STEP_DOES.tickedByHand,
  // The checklist's item that stands for a flow.
  'w13j.flowEntered.inFlow': 'In flow {flow}, about {about}.',
  'w13j.flowEntered.noTitle': 'a record that is not there',
  'w13j.flowEntered.flowRun': 'Flow run:',
  'w13j.flowEntered.endsOn.handOnly': 'Only a tick by hand ends it.',
  'w13j.flowEntered.endsOn.sealed': 'Ticked by the office when the run is sealed, or by hand.',
  'w13j.flowEntered.endsOn.released': 'Ticked by the office when the run is released, or by hand.',
  'w13j.flowEntered.endsOn.ends': 'Ticked by the office when the run ends, or by hand.',
  'w13j.flowEntered.endsOn.submitted': 'Ticked by the office when the plan is submitted, or by hand.',
  'w13j.flowEntered.ended.no': 'Not ended yet.',
  'w13j.flowEntered.ended.submitted': 'Ended {when}: the plan was submitted.',
  'w13j.flowEntered.ended.tickedByHand': 'Ended {when}: the item was ticked by hand.',
  'w13j.flowEntered.ended.sealed': 'Ended {when}: the run was sealed.',
  'w13j.flowEntered.ended.released': 'Ended {when}: the run was released.',
  'w13j.flowEntered.ended.ends': 'Ended {when}: the run ended.',
  // ---- w13j round 54: what the reminder before the seal did, kept on the run, and the starter's items ----
  'w13j.beforeTheSeal.title': 'Before the seal',
  'record.section.remindedBeforeTheSeal': 'Reminded before the seal',
  'record.section.checkAlso': 'Check also',
  'w13j.beforeTheSeal.nobodyRecorded': 'Nobody recorded whether this run was reminded before its seal.',
  'w13j.beforeTheSeal.notReminded.theLauncherAskedForNone': 'Sealed {at} without a reminder: the launcher sealed it after the agent’s command had ended.',
  'w13j.beforeTheSeal.notReminded.notTheRunsOwnKey': 'Sealed {at} without a reminder: the seal was not sent with the run’s own key.',
  'w13j.beforeTheSeal.notReminded.noAgent': 'Sealed {at} without a reminder: the run names no agent the office knows.',
  'w13j.beforeTheSeal.notReminded.unknown': 'Sealed {at} without a reminder. The office cannot say why.',
  'w13j.beforeTheSeal.reminded': 'Reminded {at}, asking for chapters {chapters};',
  'w13j.beforeTheSeal.remindedNoChapters': 'Reminded {at}, asking for no chapters;',
  'w13j.beforeTheSeal.remindedNotKept': 'Reminded {at}, but the office did not keep what the reminder named.',
  'w13j.beforeTheSeal.named': { one: 'it named {n} item.', other: 'it named {n} items.' },
  'w13j.beforeTheSeal.notSealedSince': 'Not sealed since.',
  'w13j.beforeTheSeal.atTheSeal': 'At the seal, {at}:',
  'w13j.beforeTheSeal.noLongerFound': { one: '{n} no longer found,', other: '{n} no longer found,' },
  'w13j.beforeTheSeal.stillFound': { one: '{n} still found.', other: '{n} still found.' },
  'w13j.beforeTheSeal.notJudged': { one: '{n} the office cannot judge.', other: '{n} the office cannot judge.' },
  'w13j.beforeTheSeal.atTheSealNotJudged': 'Sealed {at}. The office could not compare what it found then with what it named.',
  'server.checkAlsoNotARun': 'Only a run carries items for the reminder before its seal, and this record is not a run. Nothing was changed.',
  'server.checkAlsoTooMany': 'A run carries at most 20 items for the reminder before its seal. Nothing was changed.',
  'server.checkAlsoItemTooLong': 'Each item for the reminder before the seal is at most 300 characters. Nothing was changed.',
  'server.checkAlsoByTheRunItself': 'A run’s own key may not choose what the run is reminded of. Its starter or the person gives these items. Nothing was changed.',
  'server.checkAlsoWrittenOutsideItsDoor': 'The items for the reminder before a run’s seal are given when the run is filed, or on their own afterwards, not with other changes to the run. Nothing was changed.',
  'record.option.flow.ends_on.the_run_is_sealed': 'When the run is sealed',
  'record.option.flow.ends_on.the_run_is_released': 'When the run is released',
  'record.option.flow.ends_on.the_run_ends': 'When the run ends',
  // ---- w13j round loop-1: how a round ended, kept on its run, and the office's control of checks in merges-only mode ----
  'w13j.roundEnded.title': 'How the round ended',
  'record.section.howTheRoundEnded': 'How the round ended',
  'record.section.nextRound': 'Next round',
  // w13j round loop-3: the workers a supervisor asked the office to start, kept on its run.
  'record.section.workerRuns': 'Worker runs',
  // ---- w13j rounds loop-2 and loop-3: the state words of an ask kept on a run, read from STATE_WORDS so each is spelled once ----
  get 'state.starting'(): string { return englishWord('state.starting') },
  get 'state.started'(): string { return englishWord('state.started') },
  'record.section.commandEnded': 'Command ended',
  'w13j.roundEnded.sealedAsked': 'Sealed {at}, and the office asked for the check.',
  'w13j.roundEnded.sealedHeld': 'Sealed {at}, and the office held the check.',
  'w13j.roundEnded.sealedReleased': 'Sealed {at}. The office held the check, and it was released {released}.',
  'w13j.roundEnded.sealedNotAsked': 'Sealed {at}. The office did not ask for a check.',
  'w13j.roundEnded.notSealed': 'Ended {at} without a seal.',
  'w13j.roundEnded.starterTold': 'Its starter was told once.',
  'w13j.roundEnded.nobodyTold': 'Nobody was told.',
  // ---- w13j round 57: an item's links open their records ----
  'w13j.checklistLinks.about': 'About',
  'w13j.checklistLinks.noRecord': 'a record that is not there ({id})',
  'w13j.checklistLinks.noMessage': 'no message you may read ({id})',
  'w13j.checklistLinks.evidence': '{kind}: {title}',
  'w13j.checklistLinks.section': '{kind}: {block}, in {title}',
  'w13j.checklistLinks.sectionGone': '{kind}: block {block}, no longer in {title}',
  // ---- w13j round loop-4: the link that says two decisions both stand, read from LINK_TYPES so each is spelled once ----
  get 'word.link.forward.coexists_with'(): string { return englishWord('word.link.forward.coexists_with') },
  get 'word.link.reverse.coexists_with'(): string { return englishWord('word.link.reverse.coexists_with') },
  // ---- w13j round loop-4: the workers a supervisor's run asked for, drawn in words on the run's pages ----
  'w13j.workers.seal': 'Seal',
  'w13j.workers.cost': 'Cost',
  'w13j.workers.modelGiven': '{model}, the model its launcher was given',
  'w13j.workers.starting': 'Its launcher is starting it.',
  'w13j.workers.failed': 'Nothing was started: {says}',
  'w13j.workers.sealed': 'Sealed',
  'w13j.workers.notSealed': 'Not sealed',
  'w13j.workers.noReceipt': 'No receipt',
  'w13j.workers.receiptNoCost': 'Its receipt gives no cost',
  'w13j.workers.unreadable': {
    one: '{n} more entry kept on this run could not be read as an ask.',
    other: '{n} more entries kept on this run could not be read as an ask.',
  },
  // ---- w13j round loop-5: the owner's press on an item's empty box marks it done, and the office tells whoever added
  // it. {words} is the item's own words; {name} and {names} are participants' names,
  // the names joined by commas. ----
  'w13j.checklistDone.box': 'Mark as done: {words}',
  'w13j.checklistDone.boxTitle': 'Mark as done',
  'w13j.checklistDone.addedBy': 'Added by {name}',
  'w13j.checklistDone.addedByNobody': 'Added by: nobody recorded this',
  'w13j.checklistDone.tell': 'Tells {names} when the person marks it done',
  'w13j.checklistDone.byPress': 'Marked done by the person',
  'w13j.checklistDone.onWords': "Marked done by {name} on the person's message",
  'w13j.checklistDone.underRaise': "Marked done by {name} under the person's raise",
  'w13j.checklistDone.told': 'Told: {names}',
  'w13j.checklistDone.toldNobody': 'No agent was told',
  // ---- w13j round loop-5, item 2: a worker's run names the supervisor's run that asked for it. {name} is the asker's
  // registered name; the run's title is drawn after the sentence as a link. ----
  'w13j.askedFor.title': 'Who asked for this run',
  // ---- w13j round loop-5, item 0 part a: a standing checklist item, such as the owner's experiment manual, has no done
  // box. ----
  'w13j.checklistStanding.name': 'Standing item',
  'w13j.checklistStanding.fact': 'A standing item: it is never marked done, and it is not counted as open work.',
  // ---- w13j round loop-6, item 1: the press on the checklist's page that makes an open item standing, and the one that
  // makes it ordinary again. ----
  'w13j.checklistStanding.make': 'Make it standing',
  'w13j.checklistStanding.unmake': 'Make it ordinary',
  // ---- w13j round loop-8, item 1: a press on a checklist that the door refused because the checklist changed after the
  // page read it. The first is the refusal's own words, which the other two draw as {refusal} once the page has read
  // the checklist again; "Press once more" only while the press it draws does what the refused press asked and its row
  // has not moved (round loop-9). ----
  'server.checklistChangedSinceRead': 'This checklist changed while the page was open, so nothing was changed.',
  'w13j.checklistPress.readAgain': '{refusal} The page has read it again.',
  'w13j.checklistPress.pressOnceMore': '{refusal} The page has read it again. Press once more.',
  // ---- w13j round loop-9, item 1: what a press on a checklist row says when the row moved as the page read the
  // checklist again, for the second the row takes no press. ----
  'w13j.checklistMoved.reason': 'This item may have moved just now, so it takes no press for one second.',
  // ---- w13j, the round after loop-10, item 2: the commit a worker's worktree is cut from. Three refusals of the
  // worker-run door, and the section of a worker's run that says which commit the ask chose and whether it was used. ----
  'server.workerCutNotInTheSandbox': "The sandbox's repository does not keep the commit to cut the worker from, so nothing was asked.",
  'server.workerCutHeadUnread': "This run's own commit could not be read, so the worker has no commit to be cut from, and nothing was asked.",
  'server.workerCutWorktreeAlreadyThere': "The worker's worktree is there already, so it cannot be cut from the commit named, and nothing was asked.",
  'server.workerCloneNotOfTheSandbox': "The clone named is not one of the sandbox's clones, so nothing was asked.",
  'record.section.cutAsked': 'Cut asked',
  // Every participant the confirmation door allows is named as an alternative.
  'w13j.confirm.or': '{first} or {next}',
  'w13j.confirm.waits.allowed': 'Waiting for {who} to confirm the report.',
} as const
