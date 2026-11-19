// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE, OVER HTTP. Sandbox v1, piece P6: SPEC.md section 5.2, widened by the owner's
 * decision R3 of 21 September 2026 (a changeset through a git or a files adapter).
 *
 *   POST /api/merge-queue                  submit a sealed run's changeset, or a secretary's design/ change
 *   GET  /api/merge-queue                  the queue, lane by lane
 *   GET  /api/merge-queue/landed-between  bounded landings and uncovered gaps
 *   GET  /api/merge-queue/landed-since    merged entries after a moment, one bounded batch at a time
 *   GET  /api/merge-queue/measures        the queue's measures of its last days, one day at a time (read-only)
 *   POST /api/merge-queue/:id/hand-back-from-the-main-suite  the receipt filer proves a main-suite red
 *   GET  /api/merge-queue/:id              one entry, and what its next move waits on
 *   POST /api/merge-queue/:id/withdraw     its submitter or the person takes it back, before it lands
 *   POST /api/merge-queue/:id/step         the merge tool reports a step        (the message worker only)
 *   POST /api/merge-queue/:id/tool-started the office started the merge tool   (the message worker only)
 *   POST /api/merge-queue/:id/tool-ended   the merge tool ended                 (the message worker only)
 *   POST /api/merge-queue/:id/confirm-deletes the secretary confirms the deletes a files entry carries
 *   POST /api/merge-queue/:id/land-again  the person or the secretary asks again for a landing that stalled
 *   POST /api/merge-queue/:id/first       the person or the queue's owner moves an entry to the front of its lane
 *   POST /api/merge-queue/:id/press-to-land the secretary or the person lets an entry touching a sensitive path land
 *   POST /api/merge-queue/:id/resolution  the entry's own line hands over the resolution of its conflict, or says it cannot be resolved, within the hour
 *   POST /api/merge-queue/:id/nobody-started the secretary or the person records that nobody started the resolve brief
 *   POST /api/merge-queue/emergency-pushes        the person or the secretary starts an emergency push to main
 *   POST /api/merge-queue/emergency-pushes/:id/end and ends it, as git shows
 *   GET  /api/merge-queue/emergency-pushes/:id    one push, with its follow-up as read now
 *   POST /api/merge-queue/emergency-pushes/hand-back-from-the-main-suite  the receipt filer hands a push's red follow-up back
 *   POST /api/merge-queue/lines            the person or a secretary turns an agent's line on or off, for the office to queue its seals
 *   POST /api/merge-queue/at-the-seal/again the person or a secretary asks the office to decide a waiting seal again
 *
 * THE RULES ARE IN src/server/lib/merge-queue.ts (the data layer) and src/server/lib/merge-state-machine.ts
 * (which state follows each step, piece P7). What is here is the door: who may knock, what shape the
 * body is, and what comes back. Refusals follow SPEC.md 5.2: 403 for who is asking, 409 for the state
 * of the thing, and 422 for a report from the merge tool whose shape or content is wrong. A person's
 * or an agent's malformed request is a 400, as it is on every other door of this server.
 */

import { sayInEnglish } from '../../shared/i18n.ts'
import { landingsBetween, handBackFromTheMainSuite } from '../lib/main-suite-hand-back.ts'
import { LANDED_SINCE_DEFAULT, LANDED_SINCE_MOST } from '../../shared/landed-since.ts'
import { landingsSince } from '../lib/landed-since.ts'

import { isAbsolute } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { A_STEP_IS_TAKEN_FROM, MERGE_LIST_SHAPES, MERGE_STATES, MERGE_STEPS, MERGE_STATE_SPECS } from '@shared/merge-queue.ts'
import { MERGE_WORKERS_BOUNDS } from '../../config/settings.mjs'
import { gateNamed } from '../../config/gates.mjs'
import { askTheOfficeAgain, theOfficeDecidesTheWaitingSeals, turnALine, whoHeldTheQueue, type AWaitingSealDecided } from '../lib/merge-queue-at-the-seal.ts'
import { mayChangeTheOfficesSettings } from './runtime-settings.ts'
import { localStamp, momentOfAnInstant, parseAnyStamp, theClockZone, uniqueMomentOfStoredStampInZone } from '@shared/time.ts'
import { stateWord } from '@shared/words.ts'
import { actorFrom, explain } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { refuseAnActWithNoKey, type ADoorThatAsksForAKey } from '../lib/keyheader.ts'
import { route } from '../lib/route.ts'
import { nothingWrittenSentence, type Actor } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { THE_WORKER } from '@shared/the-worker-actor.ts'
import {
  A_SECRETARY_SUBMISSION,
  A_SUBMISSION,
  listMergeQueue,
  listMergeQueueByIds,
  listMergeQueueNarrowly,
  readMergeEntry,
  recordMergeToolStarted,
  submitAMergeEntry,
  submitASecretarysDesignEntry,
  theLandingsASubmissionComparesAreRead,
  theMergeEntry,
  theReadsRecordOf,
  withdrawAMergeEntry,
  withWhatTheToolWaitsOn,
} from '../lib/merge-queue.ts'
import { thePagesLanes, theQueuePageReading } from '../lib/merge-queue-page.ts'
import { theQueuesMeasures } from '../lib/merge-queue-measures.ts'
import { MEASURES_DAYS } from '@shared/merge-queue-measures.ts'
import { thePairOfThisProcess } from '../../config/the-office-tool-environment.mjs'
import { endAnEmergencyPush, handBackAPushesRed, readAnEmergencyPush, startAnEmergencyPush, theEmergencyPushes } from '../lib/emergency-push.ts'
import {
  askAStalledLandingAgain,
  confirmTheDeletes,
  handOverAResolution,
  moveToTheFront,
  pressTheEntryToLand,
  recordThatNobodyStarted,
  sayTheConflictCannotBeResolved,
  stepAMergeEntry,
  theEntryWasWithdrawn,
  theMergeToolRunEnded,
  whoDeclaresTheSupervisorsOwnRun,
  whoHandsOverAResolution,
  whoMovesAnEntryFirst,
  whoPressesAnEntryToLand,
  whoRecordsThatNobodyStarted,
} from '../lib/merge-state-machine.ts'

// ============================================================================ the sentences

const SUBMIT_NOTE =
  'SUBMIT A SEALED RUN\'S CHANGESET TO THE MERGE QUEUE. Body {"run":"<session id>","changeset":{…}}. The changeset ' +
  'may also carry fixRound:{problem,kind:"repair"|"takeout"} and, for one checked take-out, takesOut:[<actual causal entry ids>]. A take-out must include fixRound.reason, exactly "hour expired", "repair not green" or "verification unavailable"; a repair omits reason. The separate worker take-back door alone admits not fixed in time for an overdue hand-back. The queue validates it against the authoritative original deadline or actual repair verification and computes the title from the causal IDs, original red receipt and exact verification outcome. No title text is accepted. The active secretary submits on its own proved continuing controller key; original evidence and pending correlation remain on the authoritative problem. The changeset ' +
  'is {"adapter":"git","repository":"<id or name>","branch":"<optional>"} — its commit and base are read off the ' +
  'run\'s seal, never sent — or {"adapter":"files","root":"<absolute directory it lands in>","stagedAt":' +
  '"<absolute folder holding the new content at <stagedAt>/<path>>","onConflict":"bounce"|"keep-both",' +
  '"operations":[{"op":"add"|"modify"|"delete"|"rename","path":"<relative>","from":"<rename only>","before":' +
  '"<sha256>"|"absent","after":"<sha256>"|"absent","source":"<where it came from>","record":"<optional id>"}]}. ' +
  'Refused with 409 when the run has no seal. Only the run\'s own agent, the agent that started it, or the person ' +
  'may submit; while the gate "who-submits-a-merge-entry" is off, any agent proved by its own key may also submit, and ' +
  `the entry names it as its submitter. The person or the agent holding the secretary card may add "suiteWorkers":<whole number from ${String(MERGE_WORKERS_BOUNDS.fewest)} to ${String(MERGE_WORKERS_BOUNDS.most)}>: the merge ` +
  "tool's whole suite then runs at that many workers for this entry, and the entry is tested alone, never on a bus" +
  '; anybody else is refused with 403. An older entry for the same work — one lane, and a newer commit that contains its commit, or one staging folder — is superseded, and its people are told. ' +
  'An older git entry whose commits the newer entry\'s base holds stays in the queue, and the answer says it lands first. ' +
  'The agent holding the secretary card may instead send {"changeset":{"adapter":"git","repository":"<id or name>",' +
  '"branch":"<b>"},"workingDirectory":"<absolute folder at that branch\'s tip>"} with no run, for a change to design/ ' +
  'files only: the office files and seals the run itself, and no check is asked.'

const LIST_NOTE =
  'THE MERGE QUEUE, LANE BY LANE. A lane is the directory a changeset lands in, and it takes one entry at a time. ' +
  'Narrow with ?lane=<directory>, ?repository=<id or name> (its checkout is the lane) and ?state=<a,b>. Each ' +
  'lane says which entry holds it now, in whichever project that entry is. Beside the lanes: `speed`, the last 24 hours ' +
  '{at, since, landed, landedUnreadable, buses:{ran, aboardEach|null, unreadable}, judgedToLanded:{medianMinutes|null, measured, ' +
  'unreadable}}, and `page` {lanes:[{lane, bus|null, order, movable}], submitters, movers, pressers, names}, where `order` is the ' +
  'order the entries in the reply will land in, `movers` names who moved each entry the reply holds as movedFirst, and ' +
  '`pressers` who pressed each entry the reply holds as pressToLand.pressed. ' +
  '`unreadable` [{id, title, why}] names each entry of this project that is not in the shape the queue writes, with ' +
  "the queue's reason. Its lane and state cannot be told, so it is named whatever lane or states were asked for, and the " +
  'lanes leave it out: a reader that acts on the lanes should not act on a reply that names one. GET /api/merge-queue/<id> ' +
  'still fails on it. ' +
  'With no ?shape every entry is answered whole. ?shape=narrow answers each entry with only {id, state, lane, run, ' +
  'changeset, repairOf, suiteWorkers, movedFirst, machine:{judged, resolution, tested:{testedWith, build, log}, ' +
  'integrated:{mainBefore, mainAfter}}}, judged only while the entry is not final, and leaves out `speed` and `page`. ' +
  '?shape=page answers each entry with only the fields the merge queue page draws, and everything beside the lanes. ' +
  '?shape=ids answers each entry with only {id, state, lane}, in the same order, and beside the lanes only `unreadable`, ' +
  '`says` and `workspaceId`. ' +
  'Writes nothing.'

const LANDED_SINCE_NOTE =
  'THE MERGED ENTRIES THAT LANDED AT OR AFTER A MOMENT, oldest first, in bounded batches. `since` names one moment: ' +
  'the office\'s own `YYYY-MM-DD HH:MM:SS` local wall clock, which must name exactly one moment, or an instant with its ' +
  'offset. The boundary is inclusive on the exact landing moment stored as `integrated.time.instant`, and an observation ' +
  'without an explicit `Z` or offset is not readable. Entries whose landing has no readable clock observation are not ' +
  'placed: `unreadablePresent` is true when there is at least one ' +
  `such entry in the same scope, or a landing whose lane cannot be read when a lane is requested, and complete ordering cannot be claimed while it is true. \`limit\` is the batch size, 1 to ${String(LANDED_SINCE_MOST)}, and ${String(LANDED_SINCE_DEFAULT)} when left out. \`repository\` keeps ` +
  'one checkout; `lane` keeps one queue lane. Each landing carries `lane` and `pathsChanged`, which is null when its integrated path map is absent or unreadable. Rows are ordered by their exact landing moment and then by id, so a repeated local hour has one stable ' +
  'order. `truncated` is true when more rows follow this batch, and then `next` is the cursor: send its exact instant ' +
  'back as `afterAt` with its `id` as `afterId`, and the same `since`, `repository` and `lane`. The cursor is exclusive, so ' +
  'pages neither repeat nor skip a landing. Writes nothing.'

const READ_NOTE =
  'ONE MERGE ENTRY: its changeset, its state, what that state means and what the next move waits on, and the ' +
  'entries it supersedes or that superseded it. Writes nothing.'

const READS_NOTE =
  "WHAT THE SUITE READS, BY MAIN'S RECORD, for the main an entry was integrated on: the files " +
  'read and the folders listed, as the merge tool recorded them when the suite last ran on that tree, with what the code ' +
  'names added as the floor. A file no test reads may land on its own as documentation. 404 when main had no record. ' +
  'Writes nothing.'

const WITHDRAW_NOTE =
  'WITHDRAW A MERGE ENTRY. Body {"because":"<one sentence>","waitingOnly":<optional true>}. waitingOnly checks the current state atomically: every withdrawable pre-test state qualifies, and testing or landing refuses without writing. Only whoever submitted it, or the person; while the gate "who-withdraws-a-merge-entry" is off, any agent proved by its own key may also withdraw it, and the entry names who withdrew it. Refused ' +
  'with 409 once it is landing — the office has started moving the main world — or once it is final.'

const STEP_NOTE =
  'THE MERGE TOOL REPORTS ONE STEP, AND THE SERVER DECIDES THE NEXT STATE. Body {"step":"<step>","facts":{…}}. ' +
  'Only the office\'s message worker may knock, and a request a listener carried comes with a key this office knows. Each step is taken from one state — ' +
  MERGE_STEPS.map((step) => `${step} from ${A_STEP_IS_TAKEN_FROM[step]}`).join(', ') +
  ' — and is refused with 409 from any other. The facts: pinned {files:{path:hash|"absent"}, checker?}; ' +
  'integrating {}; integrated {result, mainAt, clone?, files, checker?}; conflict {files, mainAt?, log?}; ' +
  'guard-failed {guard, files, detail?, log?}; tested {green, redTests?, log, tip?, ran?, passed?, says?, testedWith?: {entry, tree, forTheOther?, collision?} when it ran the suite of a pair, borrowedFrom?: {entry, tree} when it borrows from one, loadTimeouts?: [{file, mainAt, here:{entryLog?, mainLog?}, modal:{entry:{commit, log, report}, main?}}] for files red here that a second opinion on Modal cleared, plugin?: {id, manifest} when a plugin\'s own check tested a plugin-only change in place of the suite}; landing {mainAt}; ' +
  'main-moved {mainAt}; main-moved-while-testing {mainAt}; moved-past-documents {mainAt, result, documents, files}; landed {mainAfter}. pinned may carry documents {tree, files} and integrated reads {tree, files, folders, record}. A checker report is {tool?, checked?, decided:[{path,check,ok,detail?}], ' +
  'needsJudgment:[{path,why}]}, as tools/checks/*.mjs print it. The reply says what was decided and why.'

const CONFIRM_DELETES_NOTE =
  'THE SECRETARY CONFIRMS THE DELETES A FILES ENTRY CARRIES. Body {"because":"<one sentence>"}. ' +
  'A delete in the main world waits for a secretary\'s confirmation, so the landing step is refused ' +
  'until this is pressed. Only whoever holds the secretary card, or the person. 409 when the entry deletes nothing, ' +
  'is final, or was already confirmed.'

const LAND_AGAIN_NOTE =
  'ASK THE OFFICE TO TRY A STALLED LANDING AGAIN. Body {"because":"<one sentence>"}. Only ' +
  'the person, or whoever holds the secretary card. Only for a git entry in landing whose merge tool exhausted ' +
  `the number of merge tool runs set on the Gates panel without landing it. The office reads where main stands in the entry's ` +
  'checkout, clears the count, records who asked, when, why and where main stood, and asks for its merge tool again ' +
  'wherever main stands, saying which the tool will meet: its landing step lands the entry when main is still where it ' +
  'was integrated, finishes when main is already at its final commit, and otherwise sends it back to be integrated ' +
  'again. With "integrateAgain":true in the body the office sends the entry back to be integrated again at once, where ' +
  'it may also be withdrawn, and does that only while main is exactly where the entry was integrated; 409 when it is ' +
  'not, and the ask without the flag is the door then. 403 for any other caller, 409 for any other entry, and nothing is written.'

const FIRST_NOTE =
  'MOVE AN ENTRY TO THE FRONT OF ITS LANE. Body {"because":"<one sentence>"}. ' +
  'Only the person, proved by their key or the key window; the merge queue\'s owner, the agent the person names on the ' +
  'Settings page (GET /api/office/merge-queue-owner; nobody until named), by its own key; or a secretary the person has ' +
  'raised, by its own key, and the entry then names the raise. The entry becomes the next to take its lane: nothing is interrupted, the entry ' +
  'holding the lane keeps it, the riders of the lane\'s newest bus and the entries it passed over for a check still go ' +
  'first, and two moved entries go in the order they were moved. Who moved it, when and why are kept on the entry as ' +
  'movedFirst. Asked in this order: 404 for an entry not in this project, 403 for any other caller (with a body or ' +
  'without one), 400 for a missing or blank reason, 409 for an entry that is final, holds its lane or was already ' +
  'moved. Nothing is written on any refusal.'

const PRESS_NOTE =
  'LET AN ENTRY THAT TOUCHES A SENSITIVE PATH LAND. Body {"because":"<one sentence>"}. ' +
  'An entry touching a database migration (drizzle/), tools/the-merger.mjs, tools/sandbox*.mjs, ' +
  '.mole-office/protected.json or design/rules/ lands only after one press. These paths change how every later entry is ' +
  'tested and landed, what keeps the sandbox apart, or the database schema that the next stable upgrade applies to the ' +
  "person's live database, so someone looks before they land. " +
  'The secretary is asked at the pin; the press may come before it. Only whoever holds the secretary card, or the ' +
  'person. Who pressed, when and why are kept on the entry as pressToLand.pressed. Asked in this order: 404 for an ' +
  'entry not in this project, 403 for any other caller, 400 for a missing or blank reason, 409 for an entry that is ' +
  'final, touches no such path or was already pressed. Nothing is written on any refusal.'

const RESOLUTION_NOTE =
  'HAND OVER THE RESOLUTION OF A RESOLVING ENTRY\'S CONFLICT, OR SAY IT CANNOT BE RESOLVED. Body ' +
  '{"workingDirectory":"<absolute folder whose HEAD is the resolution>"}: the office reads the folder\'s HEAD ' +
  'itself and never takes a typed commit for the resolution. The body may also declare the supervisor\'s own run of the ' +
  'related tests, as resolve-a-conflict.mjs prints it: "tests":{"commit":"<the commit it ran at>","exit":<0 to ' +
  '255>,"counts":{"passed":<n>,"failed":<n>},"log":"<absolute path>"}. Only an agent of the line whose own key proved ' +
  'its name declares one. The office runs nothing and reads no log: it records the run as declared, with who and ' +
  'when, and the scoped check shows it to the inspector as evidence, never as a pass or a fail. The merge tool\'s check ' +
  'refuses a resolution whose declared run is not at its commit. Or body {"cannot":"<one sentence>"}, with the optional ' +
  '"changesWhatOneSideMeant": true, when the conflict cannot be resolved: the entry bounces at once as refused and the ' +
  'bounce begins with the speaker\'s sentence. The resolution word "changes what one side meant", and the fixed sentence ' +
  'about keeping both sides, appear only with "changesWhatOneSideMeant": true; without it the sentence is the reason. ' +
  'The bounce keeps who said it and the sentence as `cannot`. AN ENTRY HANDED ON FOR TESTS RED ONLY WITH IT takes the ' +
  'same hand-over for a fix of them, committed on top of the replay of its own commits, and the merge tool checks that ' +
  'fix next. {"cannot"} then says the red tests cannot be fixed, and the entry bounces at once as red; ' +
  '"changesWhatOneSideMeant" is refused for it, because a red has no two sides. Only the ' +
  'entry\'s own line: the agent its run served, the agent that started it, the run\'s own starter, or the person; an ' +
  'agent whose card is a worker\'s never, because the supervisor hands it over after it has judged the worker\'s ' +
  'work. Only while the entry is resolving, and before its time to resolve has ended: the minutes stored on the ' +
  'entry at its first conflict, never started again. A resolution\'s commit must stand on the main the conflict met. ' +
  'The office records the commit, the folder, that main, each file the commit changes against it with its hash and ' +
  'mode, who and when, as the entry\'s field `resolution`; the entry stays resolving, and the merge tool checks the ' +
  'resolution next. A later hand-over inside that time replaces it. Keep the folder\'s HEAD at the resolution until ' +
  'the entry ends. Asked in this order: 404 for an entry not in this project, 403 for anybody outside the line or a ' +
  'worker, 403 for a test run declared by anybody but an agent of the line whose own key proved its name, 400 for ' +
  'any other body or a folder that is not an absolute directory here, 409 for an entry that is not resolving or a ' +
  'time to resolve that is over, and for a resolution also a conflict that named no main, a HEAD git cannot read or ' +
  'a commit that does not stand on that main, 422 for "changesWhatOneSideMeant" on an entry handed on for red tests, ' +
  'and 500 for a resolving entry whose time to resolve cannot be read. Nothing is written on any refusal.'

const NOBODY_STARTED_NOTE =
  'RECORD THAT NOBODY STARTED A RESOLVING ENTRY\'S RESOLVE BRIEF. Body {"status":<the HTTP status the next-round door ' +
  'answered, 400 to 599>,"said":"<what it said>"}. The secretary\'s watcher asks the next-round door to start the ' +
  'resolve brief the office wrote for the entry\'s supervisor; only the watcher sees a refusal, and a merge entry is ' +
  'written only with the queue\'s own mark, so the watcher tells the queue here. Only whoever holds the secretary card, ' +
  'or the person, and only while the entry is resolving. The queue keeps who, when, the status and the words as ' +
  'resolving.nobodyStarted, which the entry page shows; a later one replaces it, and the state does not move. Asked in ' +
  'this order: 404 for an entry not in this project, 403 for any other caller (with a body or without one), 400 for ' +
  'any other body, 409 for an entry that is not resolving, and 500 for a resolving entry without its conflict. ' +
  'Nothing is written on any refusal.'

const EMERGENCY_PUSH_NOTE =
  'START AN EMERGENCY PUSH TO MAIN, PAST THE QUEUE. Body {"root":"<the main checkout>","commit":"<40-character hash>",' +
  '"message":{"id","seq":1,"contentHash"},"line":"<handle>"}, where the message is the secretary\'s chat message that told ' +
  'the owner alone which commit goes to main, and the optional line is the supervisor of the line whose branch the fix ' +
  'came from (409 when it is no registered agent). The merge tool asks it before it moves main: node tools/the-merger.mjs --emergency-push. ' +
  'Only the person or whoever holds the secretary card (403). Refused with 409 when the checkout is not a registered ' +
  'repository\'s, the commit does not come after main there, the emergency switch or the message lets no emergency in, ' +
  'or an entry of the checkout is landing or another push of it is pushing: main has one writer at a time. An entry ' +
  'under test does not hold main. The reply is the push record, which holds main until it is ended. Nothing is written on any refusal.'

const END_EMERGENCY_PUSH_NOTE =
  'END AN EMERGENCY PUSH. Body {"says":"<what the merge tool did>","onward":{"ok","says"}|null}, where onward is what ' +
  'the push to the private GitHub copy and the mirror said. The office reads main itself: pushed when it is at the ' +
  'commit, stopped when it is where it was, and refused with 409 anywhere else. A stopped push pushed nothing on. Only ' +
  'the person or whoever holds the secretary card. Nothing is written on any refusal.'

const READ_AN_EMERGENCY_PUSH_NOTE =
  'ONE EMERGENCY PUSH, as the queue\'s reply carries each push: who pushed and the handle of the line it names, the chat ' +
  'message, the switch row, how it ended, and its follow-up, which is worked out on read. 409 for a record that is no ' +
  'push, 404 for an id this project does not hold. Writes nothing.'

const HAND_BACK_A_PUSHES_RED_NOTE =
  'HAND AN EMERGENCY PUSH\'S RED FOLLOW-UP BACK. Body {"receipt":"<whole-suite receipt id>","files":["<test file>"]}: the ' +
  'files red in the receipt that the main suite\'s trace found in a range no landing made. Only the agent that filed the ' +
  'receipt, proved by its own key (403). Each file must be in its failedFiles, and red alone in a receipt of version 2. ' +
  'Each push whose follow-up is this red receipt, and which changed one of the files, gets one open problem naming them, ' +
  'and one message: to the line the push named, else to whoever pushed when that is an agent, else to the holder of the ' +
  'secretary card, and to the holder of the card as well. An open problem about the push already there is named again ' +
  'with the files it does not name, and nobody is told twice. The reply is {handedBack, notThePushes}; notThePushes are ' +
  'the files no such push changed. Nothing is written on any refusal.'

const TOOL_STARTED_NOTE =
  'THE OFFICE STARTED ITS MERGE TOOL FOR THIS ENTRY. Body {"session":"<the tool run\'s session id>","log":"<path>"}. ' +
  'Only the office\'s message worker may knock, and the session must be a run of the merge tool. A request a ' +
  'listener carried comes with a key this office knows, and one with none is refused.'

const TOOL_ENDED_NOTE =
  'THE MERGE TOOL RUN FOR THIS ENTRY ENDED. Body {"session":"…","reason":"<how it ended>"}. Only the office\'s ' +
  'message worker may knock, and a request a listener carried comes with a key this office knows. It records the ending, and the reply says what follows: a run that ended without moving ' +
  `its entry has the merge tool asked for again, up to the number of merge tool runs set on the Gates panel on one arrival, and then the entry bounces as ` +
  'stalled, or, while landing, stays and the secretary is told.'

const LINES_NOTE =
  'TURN AN AGENT\'S LINE ON OR OFF, so the office puts its sealed rounds in the merge queue itself. Body {"agent":"<handle ' +
  'or id>","on":true|false,"because":"<one sentence>","repository":"<id or name>"}; a line turned on names the repository ' +
  "its entries go to. Only the person or a secretary with its own key; anybody else is refused with 403. The line is kept " +
  "on the agent's record as `queuesAtTheSeal`, and each change in its revisions. The office queues nothing at the seal " +
  `while the setting ${gateNamed('queue-at-the-seal').setting} is off.`

const AT_THE_SEAL_AGAIN_NOTE =
  'ASK THE OFFICE AGAIN ABOUT A SEALED RUN OF A LINE THAT IS ON. Body {"run":"<session id>"}. Only the person or a ' +
  'secretary with its own key. The office reads what is already done first, so asking twice gives one result: a seal ' +
  'already queued, already in the queue or not queued is answered as it stands, and a waiting seal is decided again. ' +
  "The reply is {run, queuedAtTheSeal, says}. Refused with 409 while the setting is off or the run's line is off."

// ============================================================================ the shapes

const whichEntry = z.object({ id: z.string().min(1) }).strict()

const narrowedTo = z
  .object({
    lane: z.string().min(1).optional(),
    repository: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    shape: z.enum(MERGE_LIST_SHAPES).optional(),
  })
  .strict()

const A_MOMENT =
  'since names one moment: a local stamp like 2026-11-09 14:30:00 that names exactly one moment in the office clock, ' +
  'or an instant with its offset like 2026-11-09T14:30:00+00:00.'
const A_CURSOR_MOMENT = 'afterAt is the exact instant next.at gave, with its offset.'

function theMomentAsked(said: string): number | null {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(said)) return momentOfAnInstant(said)
  return uniqueMomentOfStoredStampInZone(said.replace('T', ' '), theClockZone())
}

const aMoment = z
  .string({ error: A_MOMENT })
  .trim()
  .min(1, { error: A_MOMENT })
  .transform((said, ctx) => {
    const ms = theMomentAsked(said)
    if (ms === null) {
      ctx.addIssue({ code: 'custom', message: A_MOMENT })
      return z.NEVER
    }
    const at = new Date(ms)
    return { instant: at.toISOString(), local: localStamp(at) }
  })

const aCursorMoment = z
  .string({ error: A_CURSOR_MOMENT })
  .trim()
  .min(1, { error: A_CURSOR_MOMENT })
  .transform((said, ctx) => {
    const ms = momentOfAnInstant(said)
    if (ms === null) {
      ctx.addIssue({ code: 'custom', message: A_CURSOR_MOMENT })
      return z.NEVER
    }
    return new Date(ms).toISOString()
  })

const landedSinceQuery = z
  .strictObject({
    since: aMoment,
    limit: z.coerce
      .number({ error: 'limit must be a whole number of rows' })
      .int({ error: 'limit must be a whole number of rows' })
      .min(1, { error: 'limit must be at least 1' })
      .max(LANDED_SINCE_MOST, { error: `limit must be ${String(LANDED_SINCE_MOST)} or less` })
      .default(LANDED_SINCE_DEFAULT),
    repository: z.string().trim().min(1, { error: 'repository must not be empty' }).optional(),
    lane: z.string().trim().min(1, { error: 'lane must not be empty' }).optional(),
    afterAt: aCursorMoment.optional(),
    afterId: z.string().trim().min(1, { error: 'afterId must not be empty' }).optional(),
  })
  .superRefine((asked, ctx) => {
    if ((asked.afterAt === undefined) !== (asked.afterId === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['afterAt'], message: 'afterAt and afterId are the cursor and are sent together.' })
    }
  })

const theWithdrawal = z
  .object({
    waitingOnly: z.literal(true).optional(),
    because: z
      .string({ error: 'withdrawing an entry says why, in one sentence.' })
      .trim()
      .min(1, { error: 'withdrawing an entry says why, in one sentence.' })
      .max(600),
  })
  .strict()

const theConfirmation = z
  .object({
    because: z
      .string({ error: 'confirming the deletes says why, in one sentence.' })
      .trim()
      .min(1, { error: 'confirming the deletes says why, in one sentence.' })
      .max(600),
  })
  .strict()

const theAskingAgain = z
  .object({
    because: z
      .string({ error: 'asking the office to try a landing again says why, in one sentence.' })
      .trim()
      .min(1, { error: 'asking the office to try a landing again says why, in one sentence.' })
      .max(600),
    integrateAgain: z.boolean({ error: 'integrateAgain is true or false.' }).optional(),
  })
  .strict()

const theMoveFirst = z
  .object({
    because: z
      .string({ error: 'moving an entry to the front of its lane says why, in one sentence.' })
      .trim()
      .min(1, { error: 'moving an entry to the front of its lane says why, in one sentence.' })
      .max(600),
  })
  .strict()

const thePress = z
  .object({
    because: z
      .string({ error: 'pressing an entry to land says why, in one sentence.' })
      .trim()
      .min(1, { error: 'pressing an entry to land says why, in one sentence.' })
      .max(600),
  })
  .strict()

const aLineTurned = z
  .object({
    agent: z.string({ error: 'a line names its agent, by handle or id.' }).trim().min(1, { error: 'a line names its agent, by handle or id.' }),
    on: z.boolean({ error: 'on is true or false.' }),
    because: z
      .string({ error: 'turning a line on or off says why, in one sentence.' })
      .trim()
      .min(1, { error: 'turning a line on or off says why, in one sentence.' })
      .max(600),
    repository: z.string({ error: 'a repository is named by its id or its name.' }).trim().min(1, { error: 'a repository is named by its id or its name.' }).optional(),
  })
  .strict()

const aSealAskedAgain = z.object({ run: z.string({ error: 'asking again names the run.' }).trim().min(1, { error: 'asking again names the run.' }) }).strict()

/** Only the person or a secretary with its own key turns a line, or asks the office again about a seal. */
function onlyWhoMayChangeTheSettings(actor: Actor, what: string): void {
  if (!mayChangeTheOfficesSettings(actor)) throw new PanelError(`Only the person or a secretary with its own key ${what}. Nothing was written.`, 403)
}

/**
 * AN ENTRY ENDED AT THIS DOOR, SO THE OFFICE DECIDES THE SEALS THAT WAITED (wave 13u round 93). Nothing is read while the
 * office does not queue at the seal; the reply carries what it decided only when it decided something.
 */
function andTheWaitingSeals(ended: boolean, writes?: { wrote: boolean }): { sealsDecided?: AWaitingSealDecided[] } {
  if (!ended) return {}
  const decided = theOfficeDecidesTheWaitingSeals(writes)
  return decided.length === 0 ? {} : { sealsDecided: decided }
}

const A_COMMIT = { error: 'a declared test run names the commit it ran at, as 40 or 64 hex digits.' }
const AN_EXIT = { error: 'a declared test run gives the exit code its command returned, a whole number from 0 to 255.' }
const A_COUNT = { error: 'a count of tests is a whole number, 0 or more.' }
const A_LOG = { error: 'a declared test run names the absolute path of its log.' }
/** THE SUPERVISOR'S OWN TEST RUN, AS DECLARED (XHY2fVFG3Qq8, answer 3), in the shape resolve-a-conflict.mjs prints. */
const theDeclaredRun = z
  .object({
    commit: z.string(A_COMMIT).regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u, A_COMMIT),
    exit: z.number(AN_EXIT).int(AN_EXIT).min(0, AN_EXIT).max(255, AN_EXIT),
    counts: z
      .object({ passed: z.number(A_COUNT).int(A_COUNT).min(0, A_COUNT), failed: z.number(A_COUNT).int(A_COUNT).min(0, A_COUNT) }, { error: 'a declared test run counts the tests that passed and failed, as {"passed": <n>, "failed": <n>}.' })
      .strict(),
    log: z.string(A_LOG).max(4096).refine((path) => isAbsolute(path), A_LOG),
  }, { error: 'a declared test run is {"commit", "exit", "counts", "log"}.' })
  .strict()

const theResolution = z
  .object({
    workingDirectory: z.string({ error: 'a resolution names the absolute folder whose HEAD is the resolution.' }).min(1, { error: 'a resolution names the absolute folder whose HEAD is the resolution.' }).max(4096),
    tests: theDeclaredRun.optional(),
  })
  .strict()

const theCannot = z
  .object({
    cannot: z
      .string({ error: 'saying a conflict cannot be resolved gives one sentence on why.' })
      .trim()
      .min(1, { error: 'saying a conflict cannot be resolved gives one sentence on why.' })
      .max(600, { error: 'saying a conflict cannot be resolved gives one sentence on why.' }),
    changesWhatOneSideMeant: z
      .literal(true, { error: '"changesWhatOneSideMeant" is true or left out: true says keeping both sides would change what one side meant.' })
      .optional(),
  })
  .strict()

const theNobodyStarted = z
  .object({
    status: z
      .number({ error: 'recording that nobody started a resolve brief names the status the next-round door answered, a whole number from 400 to 599.' })
      .int({ error: 'recording that nobody started a resolve brief names the status the next-round door answered, a whole number from 400 to 599.' })
      .min(400, { error: 'recording that nobody started a resolve brief names the status the next-round door answered, a whole number from 400 to 599.' })
      .max(599, { error: 'recording that nobody started a resolve brief names the status the next-round door answered, a whole number from 400 to 599.' }),
    said: z
      .string({ error: 'recording that nobody started a resolve brief says what the next-round door said.' })
      .trim()
      .min(1, { error: 'recording that nobody started a resolve brief says what the next-round door said.' })
      .max(2000),
  })
  .strict()

const aStep = z.object({ step: z.enum(MERGE_STEPS), facts: z.record(z.string(), z.unknown()) }).strict()
const aToolStart = z.object({ session: z.string().min(1), log: z.string().min(1) }).strict()
const aToolEnd = z.object({ session: z.string().min(1), reason: z.string().min(1) }).strict()

/** A report from the merge tool whose shape is wrong: 422, SPEC.md 5.2 — it is evidence, not a request. */
function parseTheReport<S extends z.ZodType>(schema: S, value: unknown, subject: string): z.output<S> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw new PanelError(`${subject} ${explain(result.error)} Nothing was written.`, 422)
}

/** Only the office's message worker reports what its merge tool did. The check tool's doors ask the same. */
function onlyTheMessageWorker(actor: Actor, what: string): void {
  if (actor.type !== THE_WORKER.type || actor.id !== THE_WORKER.id) {
    throw new PanelError(`Only the office's message worker ${what}. Nothing was written.`, 403)
  }
}

/** The states a list may be narrowed to, from `?state=a,b`, each one a word the queue stores. */
function theStatesAsked(said: string | undefined): (typeof MERGE_STATES)[number][] | undefined {
  if (said === undefined) return undefined
  const words = said.split(',').map((one) => one.trim()).filter((one) => one !== '')
  const unknown = words.filter((one) => !(MERGE_STATES as readonly string[]).includes(one))
  if (unknown.length > 0) {
    throw new PanelError(`${unknown.join(', ')} ${unknown.length === 1 ? 'is not a state' : 'are not states'} a merge entry can be in. The states are ${MERGE_STATES.join(', ')}.`)
  }
  return words as (typeof MERGE_STATES)[number][]
}

// ============================================================================ the routes

/** The three merge tool doors that take an act only with a key; the words are in lib/keyheader.ts. */
const A_MERGE_STEP: ADoorThatAsksForAKey = { act: "This report of a merge tool's step", nothingWasDone: 'Nothing was written.' }
const A_MERGE_TOOL_START: ADoorThatAsksForAKey = { act: "This record of a merge tool's start", nothingWasDone: 'Nothing was written.' }
const A_MERGE_TOOL_END: ADoorThatAsksForAKey = { act: "This record of a merge tool's end", nothingWasDone: 'Nothing was written.' }

export async function mergeQueueRoutes(app: FastifyInstance): Promise<void> {
  app.post('/merge-queue', route('merge.submit', 'remote', SUBMIT_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    // THE CALLER IS READ FIRST, for its refusals in the order they have always come. Who is calling only: whether this
    // submission proves its own run is known once its body is read, and the run the session header names is asked then.
    actorFrom(req, { whoOnly: true })
    // THE SECRETARY'S BODY IS KNOWN BY ITS WORKING FOLDER, so a body that forgot its run is still told about the run.
    let written: ReturnType<typeof submitAMergeEntry> | ReturnType<typeof submitASecretarysDesignEntry>
    if (typeof req.body === 'object' && req.body !== null && Object.hasOwn(req.body, 'workingDirectory')) {
      const submission = parse(A_SECRETARY_SUBMISSION, req.body, "The secretary's submission")
      written = submitASecretarysDesignEntry({ workspaceId, submission, actor: actorFrom(req) })
    } else {
      const submission = parse(A_SUBMISSION, req.body, 'The submission')
      const actor = actorFrom(req, submission.fixRound === undefined ? undefined : { proveOwnRun: true })
      // THE LANDINGS ON MAIN ARE READ FIRST, by git processes the server does not wait for, so judging the submission
      // holds the server only briefly.
      await theLandingsASubmissionComparesAreRead(workspaceId, submission.run)
      written = submitAMergeEntry({ workspaceId, submission, actor })
    }
    void reply.code(201)
    return { ...written, workspaceId }
  })

  app.get('/merge-queue', route('merge.list', 'remote', LIST_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(narrowedTo, req.query ?? {}, 'The queue to narrow to')
    const states = theStatesAsked(asked.state)
    // ONE ENTRY THE QUEUE CANNOT READ DOES NOT HIDE THE OTHERS (wave 13u round 99): the list names it beside them.
    const listing = {
      workspaceId,
      namingWhatItCannotRead: true as const,
      ...(asked.lane === undefined ? {} : { lane: asked.lane }),
      ...(asked.repository === undefined ? {} : { repository: asked.repository }),
      ...(states === undefined ? {} : { states }),
    }
    // THE EMERGENCY PUSHES (wave 13u round 82): the lane's history, so a narrowed reply carries its lane's only.
    const pushesOf = (lanes: readonly { lane: string }[]) => theEmergencyPushes({ workspaceId, lane: asked.lane !== undefined || asked.repository !== undefined ? lanes[0]?.lane ?? null : null })
    // THE NARROW SHAPE (wave 13u round 123): only what the merge tool and the timing job read, so neither the page's
    // reading nor what the tool waits on is worked out.
    if (asked.shape === 'narrow') {
      const narrow = listMergeQueueNarrowly(listing)
      return { ...narrow, emergencyPushes: pushesOf(narrow.lanes), held: whoHeldTheQueue(), workspaceId }
    }
    // THE SHAPE OF IDS (wave 13u round 132): each entry's id, state and lane, for a reader that asks only whether an entry
    // is in some state. Nothing beside the lanes is worked out but what cannot be read and the list's sentence.
    if (asked.shape === 'ids') return { ...listMergeQueueByIds(listing), workspaceId }
    const listed = listMergeQueue(listing)
    // THE MERGE QUEUE PAGE'S READING, from wave 13p round 30: the speed, each lane's bus and landing
    // order, and who was moved first, in this one reply, so the page makes no other read.
    // WHO HELD THE QUEUE, WHEN AND WHY (wave 13u round 93): null while it is not held.
    const reading = { ...listed, ...theQueuePageReading({ workspaceId, lanes: listed.lanes, now: new Date() }), emergencyPushes: pushesOf(listed.lanes), held: whoHeldTheQueue(), workspaceId }
    // THE PAGE'S SHAPE (wave 13u round 123): the same reading, worked out from the whole lanes, with each entry cut to
    // the fields the page draws.
    return asked.shape === 'page' ? { ...reading, lanes: thePagesLanes(listed.lanes) } : reading
  })

  app.post('/merge-queue/emergency-pushes', route('merge.emergency-push', 'remote', EMERGENCY_PUSH_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const push = startAnEmergencyPush({ workspaceId, actor: actorFrom(req), body: req.body })
    void reply.code(201)
    return { push, workspaceId }
  })

  app.post('/merge-queue/emergency-pushes/:id/end', route('merge.emergency-push', 'remote', END_EMERGENCY_PUSH_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The emergency push to end')
    return { push: endAnEmergencyPush({ workspaceId, id, actor: actorFrom(req), body: req.body }), workspaceId }
  })

  app.get('/merge-queue/emergency-pushes/:id', route('merge.read', 'remote', READ_AN_EMERGENCY_PUSH_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The emergency push to read')
    return { push: readAnEmergencyPush({ workspaceId, id }), workspaceId }
  })

  app.post('/merge-queue/emergency-pushes/hand-back-from-the-main-suite', route('merge.tool', 'remote', HAND_BACK_A_PUSHES_RED_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    return { ...handBackAPushesRed({ workspaceId, actor: actorFrom(req), body: req.body }), workspaceId }
  })

  app.get('/merge-queue/landed-between', route('merge.read', 'remote', sayInEnglish('mainSuiteTrace.rangeNote')), async req => {
    const workspaceId = workspaceOf(req)
    return { ...landingsBetween(workspaceId, req.query), workspaceId }
  })

  app.get('/merge-queue/landed-since', route('merge.read', 'remote', LANDED_SINCE_NOTE), async req => {
    const workspaceId = workspaceOf(req)
    const asked = parse(landedSinceQuery, req.query ?? {}, 'The landed-since read')
    return {
      ...landingsSince(workspaceId, {
        sinceInstant: asked.since.instant,
        sinceLocal: asked.since.local,
        limit: asked.limit,
        ...(asked.repository === undefined ? {} : { repository: asked.repository }),
        ...(asked.lane === undefined ? {} : { lane: asked.lane }),
        ...(asked.afterAt === undefined ? {} : { afterInstant: asked.afterAt, afterId: asked.afterId }),
      }),
      workspaceId,
    }
  })

  // Before /merge-queue/:id, which would take "measures" for an entry's id.
  app.get('/merge-queue/measures', route('merge.read', 'remote', sayInEnglish('mergeQueueMeasures.note')), async req => {
    const workspaceId = workspaceOf(req)
    const { days } = parse(z.strictObject({ days: z.coerce.number().int().min(1).max(MEASURES_DAYS.most).optional() }), req.query, 'The query string')
    return { ...theQueuesMeasures({ workspaceId, now: new Date(), days: days ?? MEASURES_DAYS.default, pair: thePairOfThisProcess() }), workspaceId }
  })

  app.post('/merge-queue/:id/hand-back-from-the-main-suite', route('merge.tool', 'remote', sayInEnglish('mainSuiteTrace.handBackNote')), async req => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry to hand back')
    return { ...handBackFromTheMainSuite(workspaceId, id, req.body, actorFrom(req)), workspaceId }
  })

  app.get('/merge-queue/:id', route('merge.read', 'remote', READ_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry to read')
    return { entry: withWhatTheToolWaitsOn(readMergeEntry(theMergeEntry(id, workspaceId))), workspaceId }
  })

  app.get('/merge-queue/:id/reads', route('merge.read', 'remote', READS_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry whose record of reads to read')
    const entry = readMergeEntry(theMergeEntry(id, workspaceId))
    // THE RECORD IS A FILE THE MERGE TOOL KEEPS, <folder>/reads/<tree>.json, read by theReadsRecordOf, which the change
    // door reads too.
    const record = theReadsRecordOf(entry)
    if ('why' in record) throw new PanelError(record.why, record.status)
    const { kept } = record
    const reads = { tree: record.tree }
    // THE RECORD'S TIME IN THE OFFICE'S OWN FORM, local wall clock (chapter 4 rule 8; acceptance finding 61): a record the
    // merge tool kept before 24 September 2026 says it in UTC, with a trailing Z, and is answered as the moment it states.
    // A value that is no moment is answered as itself, as drawnStamp answers one, never blanked or guessed at.
    const at = typeof kept['at'] === 'string' ? kept['at'] : null
    const when = at === null ? null : parseAnyStamp(at)
    return { entry: id, ...kept, ...(at === null ? {} : { at: when === null ? at : localStamp(when) }), tree: reads.tree, workspaceId }
  })

  app.post('/merge-queue/:id/withdraw', route('merge.withdraw', 'remote', WITHDRAW_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry to withdraw')
    theMergeEntry(id, workspaceId)
    const { because, waitingOnly } = parse(theWithdrawal, req.body, 'The withdrawal')
    const actor = actorFrom(req)
    const withdrawn = withdrawAMergeEntry({ workspaceId, id, because, waitingOnly, actor })
    // A WITHDRAWAL IS AN END, AND THE SECRETARY GETS ONE LINE FOR EVERY END. SPEC.md section 5.7.
    const entry = theEntryWasWithdrawn(withdrawn, workspaceId, actor)
    return { entry, says: `Merge entry ${id} is withdrawn. ${MERGE_STATE_SPECS.withdrawn.means}`, ...andTheWaitingSeals(true), workspaceId }
  })

  app.post('/merge-queue/:id/confirm-deletes', route('merge.confirm', 'remote', CONFIRM_DELETES_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry whose deletes are confirmed')
    theMergeEntry(id, workspaceId)
    const { because } = parse(theConfirmation, req.body, 'The confirmation')
    return { ...confirmTheDeletes({ workspaceId, id, because, actor: actorFrom(req) }), workspaceId }
  })

  app.post('/merge-queue/:id/land-again', route('merge.again', 'remote', LAND_AGAIN_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry whose landing is asked again')
    theMergeEntry(id, workspaceId)
    const { because, integrateAgain } = parse(theAskingAgain, req.body, 'The asking again')
    return { ...askAStalledLandingAgain({ workspaceId, id, because, actor: actorFrom(req), ...(integrateAgain === undefined ? {} : { integrateAgain }) }), workspaceId }
  })

  app.post('/merge-queue/:id/first', route('merge.first', 'remote', FIRST_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry moved to the front')
    theMergeEntry(id, workspaceId)
    // WHO IS CALLING IS ASKED BEFORE THE REASON IS READ (qPmul3hThx3o): the entry first, so an id from another
    // project is a 404 whoever asks, then the 403, then the 400 for a missing or blank reason.
    const actor = actorFrom(req)
    // ASKED ONCE, HERE, BEFORE THE REASON IS READ. The answer is handed to the move, so the rule is not asked a second
    // time inside it; it is the same rule, and a caller the door refuses is still told so before it is told its reason
    // is missing.
    const me = whoMovesAnEntryFirst(id, actor)
    const { because } = parse(theMoveFirst, req.body, 'The move to the front')
    const moved = moveToTheFront({ workspaceId, id, because, actor, who: me })
    return { entry: withWhatTheToolWaitsOn(moved.entry), says: moved.says, workspaceId }
  })

  app.post('/merge-queue/:id/press-to-land', route('merge.press', 'remote', PRESS_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry pressed to land')
    theMergeEntry(id, workspaceId)
    const actor = actorFrom(req)
    whoPressesAnEntryToLand(id, actor)
    const { because } = parse(thePress, req.body, 'The press')
    const pressed = pressTheEntryToLand({ workspaceId, id, because, actor })
    return { entry: withWhatTheToolWaitsOn(pressed.entry), says: pressed.says, workspaceId }
  })

  app.post('/merge-queue/:id/resolution', route('merge.resolve', 'remote', RESOLUTION_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry whose resolution is handed over')
    theMergeEntry(id, workspaceId)
    const actor = actorFrom(req)
    const me = whoHandsOverAResolution(workspaceId, id, actor)
    // TWO BODIES ON ONE DOOR (message XHY2fVFG3Qq8, answer 4): one that names `cannot` says the conflict cannot be
    // resolved, and any other is read as a hand-over.
    if (typeof req.body === 'object' && req.body !== null && Object.hasOwn(req.body, 'cannot')) {
      const { cannot, changesWhatOneSideMeant } = parse(theCannot, req.body, 'The word that the conflict cannot be resolved')
      const said = sayTheConflictCannotBeResolved({ workspaceId, id, said: cannot, changesWhatOneSideMeant: changesWhatOneSideMeant === true, actor })
      return { entry: withWhatTheToolWaitsOn(said.entry), says: said.says, ...andTheWaitingSeals(MERGE_STATE_SPECS[said.entry.state].final), workspaceId }
    }
    // WHO DECLARES A TEST RUN IS ASKED BEFORE THE BODY IS READ, as who hands over is.
    if (typeof req.body === 'object' && req.body !== null && Object.hasOwn(req.body, 'tests')) whoDeclaresTheSupervisorsOwnRun(id, me, actor)
    const { workingDirectory, tests } = parse(theResolution, req.body, 'The resolution')
    let nothingWritten: string | undefined
    const handed = handOverAResolution({ workspaceId, id, workingDirectory, ...(tests === undefined ? {} : { tests }), actor, onNothingWritten: () => { nothingWritten = nothingWrittenSentence({ kind: 'already-stored' }) } })
    return { entry: withWhatTheToolWaitsOn(handed.entry), says: nothingWritten ?? handed.says, ...(nothingWritten === undefined ? {} : { nothingWritten }), workspaceId }
  })

  app.post('/merge-queue/:id/nobody-started', route('merge.nobody-started', 'remote', NOBODY_STARTED_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry whose resolve brief nobody started')
    theMergeEntry(id, workspaceId)
    const actor = actorFrom(req)
    whoRecordsThatNobodyStarted(id, actor)
    const { status, said } = parse(theNobodyStarted, req.body, 'The record that nobody started the resolve brief')
    let nothingWritten: string | undefined
    const recorded = recordThatNobodyStarted({ workspaceId, id, status, said, actor, onNothingWritten: () => { nothingWritten = nothingWrittenSentence({ kind: 'already-stored' }) } })
    return { entry: withWhatTheToolWaitsOn(recorded.entry), says: nothingWritten ?? recorded.says, ...(nothingWritten === undefined ? {} : { nothingWritten }), workspaceId }
  })

  // THE ORDER OF THE THREE QUESTIONS ON EACH WORKER DOOR IS THE ONE THE CHECK TOOL'S DOORS USE: the
  // entry in this project first, so an id from another project is a 404 whoever asks, then who is
  // knocking, then the shape of what they sent.
  //
  // A KEY COMES BEFORE ALL THREE, since piece 7 of the keys wave. The message worker sends
  // the office's key on these doors. A request a listener carried with no key this office knows is
  // refused by `refuseAnActWithNoKey` in lib/keyheader.ts before anything is read, the entry included,
  // as the verdict door does. So "whoever asks" above means whoever asks with a key, or from inside
  // the office.
  app.post('/merge-queue/:id/step', route('merge.tool', 'remote', STEP_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry the step is about')
    refuseAnActWithNoKey(req, A_MERGE_STEP)
    const entry = readMergeEntry(theMergeEntry(id, workspaceId))
    const actor = actorFrom(req)
    onlyTheMessageWorker(actor, 'reports what the merge tool did')
    const report = parseTheReport(aStep, req.body, 'The step')
    if (MERGE_STATE_SPECS[entry.state].final) {
      throw new PanelError(`Merge entry ${id} is ${stateWord(entry.state).text}, which is final, so it takes no more steps. Nothing was written.`, 409)
    }
    const decided = stepAMergeEntry({ workspaceId, id, step: report.step, facts: report.facts, actor })
    return {
      entry: decided.entry,
      decided: decided.decided,
      says: `The step "${report.step}" was read. ${decided.decided} Merge entry ${id} is ${stateWord(decided.entry.state).text}, and waits on ${decided.entry.waitsOn}.`,
      ...andTheWaitingSeals(MERGE_STATE_SPECS[decided.entry.state].final),
      workspaceId,
    }
  })

  app.post('/merge-queue/:id/tool-started', route('merge.tool', 'remote', TOOL_STARTED_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry the merge tool runs for')
    refuseAnActWithNoKey(req, A_MERGE_TOOL_START)
    theMergeEntry(id, workspaceId)
    const actor = actorFrom(req)
    onlyTheMessageWorker(actor, 'records a merge tool start')
    const body = parseTheReport(aToolStart, req.body, 'The tool run')
    let nothingWritten: string | undefined
    const entry = recordMergeToolStarted({ workspaceId, id, ...body, actor, onAlreadyStored: () => { nothingWritten = nothingWrittenSentence({ kind: 'already-stored' }) } })
    return { entry, ...(nothingWritten === undefined ? {} : { nothingWritten }), workspaceId }
  })

  app.post('/merge-queue/:id/tool-ended', route('merge.tool', 'remote', TOOL_ENDED_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichEntry, req.params, 'The entry the merge tool ran for')
    refuseAnActWithNoKey(req, A_MERGE_TOOL_END)
    theMergeEntry(id, workspaceId)
    const actor = actorFrom(req)
    onlyTheMessageWorker(actor, 'records a merge tool ending')
    const body = parseTheReport(aToolEnd, req.body, 'The tool ending')
    let alreadyStored = false
    const ended = theMergeToolRunEnded({ workspaceId, id, ...body, actor, onAlreadyStored: () => { alreadyStored = true } })
    const writes = { wrote: false }
    const waiting = andTheWaitingSeals(MERGE_STATE_SPECS[ended.entry.state].final, writes)
    const nothingWritten = alreadyStored && !writes.wrote ? nothingWrittenSentence({ kind: 'already-stored' }) : undefined
    return {
      entry: ended.entry,
      says: nothingWritten ?? `The merge tool run ${body.session} ended: ${body.reason} ${ended.says}`,
      ...(nothingWritten === undefined ? {} : { nothingWritten }),
      ...waiting,
      workspaceId,
    }
  })

  // THE OFFICE QUEUES A SEALED ROUND ITSELF (wave 13u round 93, item 30). Who is calling is asked first, then the body,
  // then the agent or the run, so a caller who may not turn a line learns nothing about which agents exist.
  app.post('/merge-queue/lines', route('merge.lines', 'remote', LINES_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const actor = actorFrom(req)
    onlyWhoMayChangeTheSettings(actor, 'turns a line on or off')
    const body = parse(aLineTurned, req.body, 'The line')
    if (body.on && body.repository === undefined) throw new PanelError('A line turned on names the repository its entries go to. Nothing was written.', 400)
    return { ...turnALine({ workspaceId, agent: body.agent, on: body.on, because: body.because, ...(body.repository === undefined ? {} : { repository: body.repository }), actor }), workspaceId }
  })

  app.post('/merge-queue/at-the-seal/again', route('merge.at-the-seal', 'remote', AT_THE_SEAL_AGAIN_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    onlyWhoMayChangeTheSettings(actorFrom(req), 'asks the office again about a sealed run')
    const { run } = parse(aSealAskedAgain, req.body, 'The asking again')
    return { ...askTheOfficeAgain(run, workspaceId), workspaceId }
  })
}
