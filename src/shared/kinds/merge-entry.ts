// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `merge_entry`, one changeset waiting to be carried into the
 * main world and where it has got to.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `unionOf` AND THE `KindSpec` TYPE FROM ./kind-common.ts, and the merge
 * queue's seven names from ../merge-queue.ts. It calls no other shared field helper, so
 * kind-common.ts does not change this round.
 */
import { unionOf, type KindSpec } from './kind-common.ts'
// THE MERGE QUEUE'S STATES, ADAPTERS AND OPERATIONS. Sandbox v1, piece P6; ../merge-queue.ts is the
// only place they live, and the declaration below reads them rather than repeating them.
import { ABSENT, BOUNCE_REASONS, CHANGESET_ADAPTERS, FILE_OPERATIONS, MERGE_STATES, MERGE_TOOL_RUNTIME, ON_CONFLICT } from '../merge-queue.ts'

export const mergeEntryKind: KindSpec = {
    kind: 'merge_entry',
    purpose:
      'ONE CHANGESET WAITING TO BE CARRIED INTO THE MAIN WORLD, AND WHERE IT HAS GOT TO. ' +
      "The queue carries a changeset — a commit on a branch, or a " +
      'manifest of files for a folder that is not in git — from a run that has a seal, one entry per lane at a ' +
      'time, and the lane is the directory it lands in.',
    whenToRecord:
      'Never by hand, and never through POST /api/records: every write to this kind is refused there, the ' +
      "person's included. Submit with POST /api/merge-queue once your run is finished and sealed; withdraw with " +
      "POST /api/merge-queue/<id>/withdraw. The office's message worker reports what its merge tool did.",
    humanOnly: false,
    fields: [
      { key: 'run', type: 'string', required: true, description: 'The session record of the run that submitted this. It had a seal when it was submitted.', example: 'run-id' },
      { key: 'seal', type: 'Record<string, unknown>', required: true, description: '{id, hash}: the seal the run held when this was submitted. A later finish of the run writes a new seal and does not change this one.', example: { id: 'seal-id', hash: 'sha256 of the seal' } },
      {
        key: 'changeset',
        type: 'Record<string, unknown>',
        required: true,
        description:
          `What lands, and where. \`adapter\` is one of ${CHANGESET_ADAPTERS.join(' or ')}, and \`root\` is the ` +
          'directory it lands in, resolved on this machine — which is also its lane. A git changeset names ' +
          '`repository` (a repository this project registered), `branch` (as its submitter said it, or null), and ' +
          "`commit` and `base`, both read off the run's seal and never typed by the caller. A files changeset " +
          `names \`stagedAt\` (the folder the new content waits in, one file at \`<stagedAt>/<path>\`), ` +
          `\`onConflict\` (${ON_CONFLICT.join(' or ')}) and \`operations\`: each has \`op\` ` +
          `(${FILE_OPERATIONS.join(', ')}), \`path\`, \`from\` on a rename, \`before\` and \`after\` ` +
          `(sha256, or "${ABSENT}"), \`mode\` when it names one (100644 or 100755), \`source\` — where the content ` +
          'came from — and `record` when it belongs to one. Written once, when the entry is submitted, and never changed.',
        example: { adapter: 'git', root: '/srv/mole-office-fixtures/checkout', repository: 'repository-id', branch: 'work', commit: 'commit sha', base: 'commit sha' },
      },
      {
        key: 'state',
        type: unionOf(MERGE_STATES),
        required: true,
        description:
          'Where the entry has got to. The words are the merge queue\'s state machine; which may follow which is ' +
          'decided by the office, never by a caller.',
        example: 'submitted',
      },
      { key: 'submittedBy', type: 'Record<string, unknown>', required: true, description: "{kind, id}: who submitted it — the run's own agent, the agent that started it, or the person. The one besides the person who may withdraw it.", example: { kind: 'agent', id: 'agent-id' } },
      {
        key: 'submittedTime',
        type: 'Record<string, unknown>',
        required: false,
        description:
          "{stamp, instant, offset, timeZone}: the clock observation of the submission, written by the office beside the record's own createdAt, which repeats an hour when the clocks go back. " +
          "The queue page counts how long the entry has waited from its instant. It is absent on an entry submitted before it was kept, which is read from createdAt as its one moment in the office's zone, and has none in the hour the clocks go back or skip.",
        example: { stamp: '2026-09-21 23:00:00', instant: '2026-09-21T23:00:00.000+01:00', offset: '+01:00', timeZone: 'Europe/London' },
      },
      { key: 'fixRound', type: 'MainSuiteFixReference', required: false, description: 'The problem ID and repair or takeout purpose, checked on the normal sealed submission. A hand-back admits ordinary repair, or an office-filed takeout with reason not fixed in time and takeBackOf; the main-suite fix round retains its own controller and correlation checks.', example: { problem: 'example-problem', kind: 'repair' } },
      { key: 'takesOut', type: 'string[]', required: false, description: 'Unique actual causal merge-entry IDs on the one normal checked take-out submission. Receipt, cause, deadline and outcome remain on the problem.', example: ['example-causal-entry'] },
      {
        key: 'suiteWorkers',
        type: 'Record<string, unknown>',
        required: false,
        description:
          "{count, by}: how many workers the merge tool's whole suite runs at for this entry, and who named it. It is there so one entry can try a different number before the default changes. " +
          'Only the person or the agent holding the secretary card may name it, in the submission, as a whole number within the bounds of MOLE_OFFICE_MERGE_WORKERS. ' +
          'An entry that names it is tested alone: it never drives a bus and never rides one. Written once, when the entry is submitted. Absent means the suite runs at MOLE_OFFICE_MERGE_WORKERS.',
        example: { count: 12, by: { kind: 'agent', id: 'agent-id' } },
      },
      {
        key: 'occupies',
        type: 'string',
        required: false,
        description:
          'The lane this entry holds right now: the directory it is landing in. Present only while its state holds ' +
          'the lane, and written only by the office together with the state. The database refuses a second entry ' +
          'holding the same lane. Absent means it holds none.',
        example: '/srv/mole-office-fixtures/checkout',
      },
      { key: 'withdrawn', type: 'Record<string, unknown>', required: false, description: '{because, by, at}: why it was withdrawn, who withdrew it ({kind, id}), and when. Present only on a withdrawn entry.', example: { because: 'the run found a mistake after it submitted', by: { kind: 'agent', id: 'agent-id' }, at: '2026-09-21 23:00:00' } },
      {
        key: 'movedFirst',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{by, at, because, turn, underARaise}: the entry was moved to the front of its lane through POST /api/merge-queue/<id>/first, with a reason, by the proved person, by the merge queue\'s owner (the agent the person names on the Settings page, GET /api/office/merge-queue-owner) with its own key, or by a secretary the person has raised. ' +
          '`turn` counts the moves in the office from 1. `underARaise` is the id of the raise that allowed the move, and is absent when no raise was needed. While the entry is waiting for its lane, it is the next to take the lane, after any entry the lane\'s newest bus lets go first; two moved entries go in the order of their turns. A move never interrupts the entry holding the lane. Absent means nobody moved it.',
        example: { by: { kind: 'person', id: 'person-id' }, at: '2026-10-07 23:00:00', because: 'This change makes the queue land eight entries an hour instead of one.', turn: 1 },
      },
      {
        key: 'returnsFirst',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{run, at, turn}: the entry let its lane go while a scoped check of it ran, and the check released it while another entry held the lane, or after another entry landed on the main it was integrated on, so it went back to judged. `run` is the check-again run that released it, `at` is when, and `turn` counts the returns in the office from 1. ' +
          'While it is judged, it is the next to take its lane after any entry the lane\'s newest bus lets go first and any entry moved to the front; two returning entries go in the order of their turns. Its next check holds the lane, and its release into testing takes the mark off. Absent means it is not back from a check.',
        example: { run: 'check-run-id', at: '2026-10-30 12:00:00', turn: 1 },
      },
      { key: 'superseded', type: 'Record<string, unknown>', required: false, description: '{by, because, at}: the newer entry that superseded this one, the sentence saying why it is the same work, and when. Written only by the office. An entry superseded before the office kept who superseded it and why has none.', example: { by: 'EXAMPLEnewer', because: "Its commit 0123456789ab contains the older entry's commit 0123456789aa: the older commit is one of its ancestors.", at: '2026-10-08 02:00:00' } },
      { key: 'tool', type: 'Record<string, unknown>', required: false, description: `{session, log, startedAt, endedAt, reason}: the last merge tool run the office started for this entry — a session whose runtime is ${MERGE_TOOL_RUNTIME} — its log, and how it ended. Absent means no tool has run for it.`, example: { session: 'tool-session-id', log: '/path/to/the-merger.log', startedAt: '2026-09-21 23:00:00' } },
      {
        key: 'toolWanted',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{since}: the office wants its merge tool run for this entry, and has since that moment. Written by the ' +
          'office, together with the state, when the entry arrives in a state whose next move is the merge tool\'s: ' +
          'submitted (to pin it), judged (to take its lane), integrating, testing and landing. Taken off when a merge tool run starts for it, ' +
          'and when it moves to a state that waits on somebody else. Written again when a merge tool run ends without moving the entry, ' +
          `up to the number of merge tool runs set on the Gates panel on one arrival (see \`stalls\`). The message worker starts the merge tool for an ` +
          'entry that holds this and that no tool run holds. Absent means the office is not asking for the tool.',
        example: { since: '2026-09-21 23:00:00' },
      },
      // ---- written by the state machine (piece P7), and by nothing else
      {
        key: 'judged',
        type: 'Record<string, unknown>',
        required: false,
        description:
          "WHAT AN INDEPENDENT PASSING VERDICT READ, PATH BY PATH: each changed path at the content hash the inspector's " +
          `release covered (sha256 of the file's bytes — the hash the seal holds for git, the manifest's after-hash for files — never git's object id; the word "${ABSENT}" for a path the change deletes). ` +
          "The verdict follows file content. When the entry is put on top of the main world, " +
          'a path whose hash is still what is here keeps its verdict and a path whose hash differs is judged again. ' +
          "Written when the release covers the pinned content, and widened by every scoped check's release. Absent means no verdict covers this entry yet.",
        example: { 'src/server/lib/x.ts': 'a blob hash' },
      },
      {
        key: 'handedOn',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'THE PATHS A CHECKER TOOL HANDED TO THE INSPECTOR AND THE INSPECTOR JUDGED, each at the content hash it read. ' +
          "A protected path the checker hands on again at the same content is not asked about twice. " +
          "On a git entry the same holds for a path the entry's own release was handed in read.needsJudgment, while its content is still what that release judged in `judged`. Absent means none was judged that way yet.",
        example: { 'design/flows/ACCEPTANCE.md': 'a blob hash' },
      },
      {
        key: 'verdict',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{run, by, at, time, how, message}: the release that covered the pinned content — H_RELEASE, held on the entry so the receipt can name it. Written when the entry becomes judged. ' +
          '`time` is the clock observation beside `at`, copied from the release, or the office\'s own for a verdict by rule; the merge tool counts a bus\'s wait from it. ' +
          'It is absent where the release stored none, and the tool then reads `at` as its one moment, which it has none of in the hour the clocks go back or skip.',
        example: { run: 'run-id', by: { kind: 'agent', id: 'inspector-one' }, at: '2026-09-22 09:00:00', time: { stamp: '2026-09-22 09:00:00', instant: '2026-09-22T09:00:00.000+01:00', offset: '+01:00', timeZone: 'Europe/London' }, how: 'an inspector', message: 'message-id' },
      },
      {
        key: 'checked',
        type: 'Record<string, unknown>',
        required: false,
        description: "{at, tool, decided, needsJudgment}: the last checker tool report the merge tool sent with a step — what the tool decided and what it handed on. Absent means no step carried one.",
        example: { at: '2026-09-22 09:00:00', tool: 'tools/checks/git-changeset.mjs', decided: [], needsJudgment: [] },
      },
      {
        key: 'integration',
        type: 'Record<string, unknown>',
        required: false,
        description: '{result, mainAt, clone, files, at, ownerContent, placeholderCommits}: what the integrate step reported last — the commit the entry became on top of the main world (or what the tool made for files), where the main world stood, the clone it was made in, and every changed path at its content hash. `ownerContent` {reminded, byPattern, says, log} is the owner-content gate\'s reminders: what it named on the lines the entry adds to what ships and did not refuse it for. It holds how many hits, how many each pattern found, the gate\'s sentence when it named any, and its log, which keeps every hit. `reminded` 0 means the gate read the entry and named nothing; absent means no gate read it, as for an entry integrated before the gate or a files entry. `placeholderCommits` {position, domain, commits, log} is each commit the commit-address gate let through at remind whose author or committer is at the placeholder domain, by its sha and the address at that domain; the side at another domain is null. It is absent when the gate let no such commit through at remind: it found none, it was at off, which only the merge tool\'s log says, or it was at block, which bounces the entry. Overwritten by each integrate step.',
        example: { result: 'commit sha', mainAt: 'commit sha', clone: '/path/to/the/merge/clone', files: { 'src/x.ts': 'a blob hash' }, at: '2026-09-22 09:00:00', ownerContent: { reminded: 0, byPattern: {}, log: '/path/to/the/merge/work/owner-content.json' } },
      },
      {
        key: 'reinspection',
        type: 'Record<string, unknown>',
        required: false,
        description: "{run, only, needsJudgment, askedAt, says}: the scoped check the queue asked for last — the run it is on, the paths it judges, the paths handed on to it, and what the office said when it asked. Absent means no scoped check was asked for.",
        example: { run: 'run-id', only: ['src/x.ts'], needsJudgment: [], askedAt: '2026-09-22 09:00:00', says: 'The office queued the check tool.' },
      },
      {
        key: 'reinspected',
        type: 'Record<string, unknown>[]',
        required: false,
        description: 'Every scoped check that released on the way, in order: {run, only, needsJudgment, releasedAt}. Absent means none did.',
        example: [{ run: 'run-id', only: ['src/x.ts'], needsJudgment: [], releasedAt: '2026-09-22 09:30:00' }],
      },
      { key: 'takeBackOf', type: 'Record<string, unknown>', required: false, description: 'The exact overdue hand-back taken back: problem, handed-back entry, actual landed commits, changed paths and original hours. Filed only by the office after its exact inverse tree check.', example: { problem: 'hand-back-problem', entry: 'handed-back-entry', commits: ['commit sha'], paths: ['src/x.ts'], hours: 24 } },
      {
        key: 'repairOf',
        type: 'Record<string, unknown>',
        required: false,
        description: 'A hand-back repair: {problem, files}. The submission door keeps exactly the files of the open hand-back problem, so the tool runs each alone and the office checks every result before admitting it.',
        example: { problem: 'hand-back-problem', files: ['tests/feature.test.ts'] },
      },
      {
        key: 'tested',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{green, redTests, log, tip, ran, passed, says, officeHealth, at, time, testedWith, borrowedFrom}: what the tests said on the integrated result, as the tool reported them. Written by the tested step. ' +
          "`time` is the clock observation beside `at`, which the queue's speed counts the buses that ran from. A run recorded before it was kept has only `at`, read as its one moment in the office's zone, and none in the hour the clocks go back or skip. `says` is the tool's own sentence about the run, kept since 24 September 2026 so that what the run could not do as asked, such as a worker count its setting did not name, is read on the entry. " +
          '`officeHealth` {samples, answered, unanswered, medianMs, maxMs, over10s, everySeconds} is how fast the office answered GET /api/health while the suite ran, asked every 15 seconds, kept since 24 September 2026 so the suite\'s worker count can be weighed against the office\'s own responsiveness. ' +
          'Beside it, read at the same moments since later that day, the machine: load1Median and load1Max, the 1-minute load average; availableMemoryMiBMedian and availableMemoryMiBLowest, the memory new work can have without swapping (MemAvailable); and cpus and memoryMiB, what the machine has, to read them against, so the office can be scaled up until the machine itself is the bottleneck. ' +
          "testedWith {entry, tree, forTheOther, collision, bus, passedForACheck, passedAlone} when the entry's suite ran on a pair's or a bus's tree with the lane's judged entries; passedForACheck names, in the lane's order, the entries the bus passed over because files their release read would change on its tree, and passedAlone, since 16 October 2026, those it passed over because they are tested alone; each of them takes the lane ahead of the riders marked after it. borrowedFrom {entry, tree} when this entry's result was borrowed from such a suite by the same tree. " +
          'A legacy red run is kept on the entry it bounces only when it ran a pair\'s suite, so the other can borrow what was decided for it. ' +
          '`mergeClass` keeps the office’s class-2 or class-3 decision with its own paths, limit, round and gate positions; class 3 also names cause 4 to 8 and the wide-red and narrower positions; `build` explicitly reports whether the build passed, and `repair` reports each hand-back file run alone. ' +
          '`houseRules` keeps the office’s own main-only inventory reading, blamed files, class and position; only plain H files with no mark may land red at remind or off, and the tool’s expectation never authorizes landing. ' +
          '`relatedOnly` {files,related,every,leftOutSlow:[{file,seconds}],says} records a build and related-file run on the exact entry tree; related and every count files before slow omissions, and leftOutSlow names each omitted file with its longest recorded seconds. It keeps no whole-suite reads and admits no fix round. `wholeSuiteBecause` [{case,paths?,says}] records each reason the whole suite ran at related-only, with cases 1 to 7 and at most twenty matching paths per path case. These observations decide nothing on the server and replace earlier observations on each tested step. ' +
          '`wholeSuiteRed` {outcome:"admitted-for-fix-round",build,affected,suite} keeps original queue observations, never a whole_suite_receipt: build {source:"original",tip,tree,exit:0,log}; affected {source:"original",tip,tree,selection:"complete",exit:0,files,ran,passed,log,report}; suite {source:"original",tip,tree,complete:true,exit:1,ran,passed,redTests,log,report}. The setting MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND is off by default. When enabled, original successful build and complete passing affected tests on the exact entry tree authorize deferring only the extra whole-suite red. `green` remains false. ' +
          '`busCause` {mainAt,suite:{commit,tree},order:[{entry,commit,tree,commits}],pairDecided:{still,brokeBy?,runsAlone?,without?}} preserves the observed bus prefixes in landing order. brokeBy maps file names to zero-based positions in order, as the existing bisector returned them. Missing cause stays unknown. This is queue provenance, not a release receipt or an authoritative fix-round problem. ' +
          "plugin {id, manifest} when the entry changes one plugin's folder and nothing else, and was tested by that plugin's own check, the secret scan of its folder and the privacy gate in place of the office's suite (plan VlQueUhVQQmi, since 12 October 2026); the office takes it only when its own reading of the entry's seal says the same.",
        example: { green: true, log: '/path/to/suite.log', ran: 812, passed: 812, at: '2026-09-22 09:40:00', time: { stamp: '2026-09-22 09:40:00', instant: '2026-09-22T09:40:00.000+01:00', offset: '+01:00', timeZone: 'Europe/London' } },
      },
      {
        key: 'attempts',
        type: 'number',
        required: false,
        description: 'How many times the main world moved under this entry, while it was tested or at landing, sending it back to judged (acceptance finding 54: the two count together). Absent means never.',
        example: 1,
      },
      {
        key: 'stalls',
        type: 'Record<string, unknown>',
        required: false,
        description:
          `{runs, secretary, says, asked}: how many merge tool runs ended without moving this entry since it arrived in its state — a crash, a stop press, a start that never reached the ledger. ` +
          `The office asks for its tool again after each; after the number of merge tool runs set on the Gates panel it bounces the entry as stalled with the last run's words, except in landing, ` +
          'where the main world may already hold part of it: there the entry stays, and `secretary` is the message that told the secretary a person must look (null when nobody holds the card). ' +
          'A run that ends while the entry is judged and another entry holds its lane is not counted: `runs` stays as it was, which may be 0, and `says` names the entry holding the lane. ' +
          'A stalled landing of a git entry can be asked again through POST /api/merge-queue/<id>/land-again, by the person or whoever holds the secretary card, wherever main stands (the landing step of the merge tool lands it, or sends it back to be integrated when main moved): ' +
          '`runs` goes back to 0, and `asked` is {by, at, because, mainAt}, who asked, when, why and the main the office found. ' +
          'With "integrateAgain":true in that body, and main exactly where the entry was integrated, the entry goes back to judged instead, and its `stalls` there holds `runs` 0 and that `asked`. ' +
          'Written by the office when a tool run ends; dropped when the entry arrives in another state, except by that ask. Absent means no tool run has ended on this arrival.',
        example: { runs: 1, says: 'The office asks for its merge tool again: 1 of 3 runs ended without moving the entry.' },
      },
      {
        key: 'waitingForRoom',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{since, at, says, message, toldAt, toldTime}: the sandbox launcher refused this entry\'s build or test with exit 75 before anything was filed or started. It does so for any of four causes: it cannot read the free space, there is under 80 GB free, docker cannot list the running GPU sandboxes, or another sandbox already runs with a GPU. `says` names which. ' +
          'Nothing ran, so the entry is not red: it keeps its place and its merge tool tries again. `since` is the first refusal of this wait, `at` the latest the tool reported, `says` the launcher\'s own sentence, and `message` the line, at most one an hour, that told the secretary (null when nobody holds the card). ' +
          '`toldAt` is when that line was written, and `toldTime` the clock observation beside it, which the hour is measured from; the local stamp repeats an hour when the clocks go back. ' +
          'A wait told before `toldTime` was stored has only `toldAt`, read as its one moment; in the hour the clocks go back or skip it has none, and the secretary is told again. ' +
          'Written by the office from the steps no-room-to-test and no-room-to-integrate; dropped when the entry arrives in another state. Absent means the launcher never refused it on this arrival.',
        example: { since: '2026-10-04 03:00:00', at: '2026-10-04 03:10:00', says: 'sandbox: the machine has 71.2 GB free where the sandboxes are, under the 80 GB a new build or test run needs.', message: 'message-id', toldAt: '2026-10-04 03:00:00', toldTime: { stamp: '2026-10-04 03:00:00', instant: '2026-10-04T03:00:00.000+01:00', offset: '+01:00', timeZone: 'Europe/London' } },
      },
      {
        key: 'waitsForAFixRound',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{since, time, until, dueAt, timeZone, minutes, asks, reserved, opened}: tests red only with this entry, in few enough files to land handed back, while its line\'s starter has no run going to fix them. ' +
          'Instead of bouncing it, the office asks the next-round door itself for a fix round: first for the line\'s own supervisor, then for the build sheriff (MOLE_OFFICE_BUILD_SHERIFF) when the line\'s ask is refused or ends with no run. The entry keeps its lane while it waits, and the person is sent no message. ' +
          '`since` is when the wait started and `time` the clock observation beside it. `until` is the local stamp the wait ends at, in `timeZone`, `dueAt` that end as an instant, and `minutes` how long the lane is held. ' +
          '`asks` [{for, agent, at, brief, status, said, holder, started, ended}] is each ask, in order. `for` is line or sheriff, and `brief` the fix brief the office wrote into that agent\'s sandbox. `status` and `said` are what the door answered; with no `status` the door was not asked, and `said` says why. ' +
          '`holder` is the run the ask is kept on, `started` {at, run} the run the round started, and `ended` {at, says} an ask that ended with no run. ' +
          '`reserved` {at, for, agent, holder} is an accepted bounded repair reservation, with no repair run started. It permits a hand-back landing; launch waits until its landed receipt is proved on main. `opened` {at, for, agent, run} records an actual running round. ' +
          'Before landing, an expired reservation or no remaining ask bounces the entry as red. After landing, a failed start leaves the original hand-back deadline and automatic take-back in effect. ' +
          'Written by the office from tested and fix-round-looked, and when the repair launcher starts or fails. A reservation is kept through landing and merged for hand-back linkage; other arrivals drop it. Absent means the office asked for no fix round on this arrival.',
        example: { since: '2026-10-25 11:00:00', time: { stamp: '2026-10-25 11:00:00', instant: '2026-10-25T11:00:00.000+00:00', offset: '+00:00', timeZone: 'Europe/London' }, until: '2026-10-25 11:05:00', dueAt: '2026-10-25T11:05:00.000+00:00', timeZone: 'Europe/London', minutes: 5, asks: [{ for: 'line', agent: 'agent-id', at: '2026-10-25 11:00:00', brief: '/srv/mole-office-fixtures/sandboxes/a-line/briefs/fix-round-entry-id.md', status: 202, said: 'The next round is asked for.', holder: 'run-id' }] },
      },
      {
        key: 'redOnMain',
        type: 'Record<string, unknown>[]',
        required: false,
        description:
          '[{file, mainAt, log, problem, at}]: test files this entry\'s run found red on main alone, which belong to no entry. The office files one open problem per file for the build sheriff (MOLE_OFFICE_BUILD_SHERIFF) and tells the secretary one line; `problem` is the problem that holds it, an earlier one when it was already open. ' +
          'Written by the office from the step red-on-main. Absent means the run found no file red on main alone.',
        example: [{ file: 'tests/a.test.ts', mainAt: 'c0ffee', log: '/path/to/main-run.log', problem: 'problem-id', at: '2026-10-04 03:20:00' }],
      },
      {
        key: 'deletes',
        type: 'Record<string, unknown>',
        required: false,
        description: "{paths, asked, confirmed}: the deletes a files changeset carries, the message that asked the secretary to confirm them, and the confirmation {by, at, because} once given. A delete in the main world waits for a secretary's confirmation, and the landing step is refused until it is here. Absent on an entry with no delete.",
        example: { paths: ['old/c.txt'], asked: 'message-id', confirmed: { by: { kind: 'agent', id: 'secretary-1' }, at: '2026-09-22 10:00:00', because: 'The file is superseded by a.pdf.' } },
      },
      {
        key: 'pressToLand',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{paths, asked, pressed, leftOut}: the paths of a git entry that land only after a press (a database migration under drizzle/, tools/the-merger.mjs, tools/sandbox*.mjs, .mole-office/protected.json or design/rules/; these change how every later entry is tested and landed, what keeps the sandbox apart, or the database schema the next stable upgrade applies to the person\'s live database, so someone looks before they land), the message that asked the secretary to press, and the press {by, at, because} once given through POST /api/merge-queue/<id>/press-to-land, by whoever holds the secretary card or by the person. ' +
          'Written by the office at the pin, or by the press when it comes first; `asked` is null when nobody was asked. ' +
          "`leftOut` {mainAt, paths} is there once the pin compared the seal's paths with main's content: the paths main already had with the same content at commit mainAt, which need no press. `paths` is then only the paths that differ, and is empty when main had them all; then nobody is asked. " +
          'Once the entry is integrated, the paths its integration changes over main are the ones that need the press. The landing step is refused until `pressed` is here while any path needs one. Absent on an entry whose seal names no such path, and on one not yet pinned or pressed.',
        example: { paths: ['drizzle/0264_example.sql'], asked: 'message-id', pressed: { by: { kind: 'agent', id: 'secretary-1' }, at: '2026-10-13 10:00:00', because: 'The migration only adds a column.' }, leftOut: { mainAt: 'main-commit', paths: ['tools/the-merger.mjs'] } },
      },
      {
        key: 'documents',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{tree, files}: THIS IS A DOCUMENTATION ENTRY: at its pin step the merge tool found every path ' +
          "it touches to be a document that no test reads, by the record of what the suite read on main's tree `tree`. It " +
          'queues in its repository\'s documentation lane, is tested with nothing to run, and lands even while a code entry ' +
          'is testing, which is then not tested again for it. Absent on every other entry.',
        example: { tree: 'tree sha', files: ['design/notes/a-note.md'] },
      },
      {
        key: 'bounced',
        type: 'Record<string, unknown>',
        required: false,
        description:
          `{reason, at, files, redTests, log, mainAt, resolution, cannot, says, changedTheirAnswer}: why the entry went back to its submitter — reason is one of ${BOUNCE_REASONS.join(', ')}. Present only on a bounced entry. ` +
          '`changedTheirAnswer` is there when MOLE_OFFICE_GATE_FLAKY was at block and test files changed their answer on one tree. It names those files, and the reason is red. They are also in `redTests`, except after a failed hand-back repair, when `redTests` names the files of the repair. ' +
          'A bounce that follows a conflict no rule joins also carries `resolution`, one of "the hour ran out", "could not be read", "changes what one side meant", "not green" and "not fixed in the hour", where each word keeps one reason and never another: "the hour ran out" and "could not be read" keep conflict, "changes what one side meant" keeps refused, and "not green" and "not fixed in the hour" keep red. "not fixed in the hour" is written when the time to fix tests red only with the entry ended with no fix handed over, or with the last fix refused by the merge tool\'s check. ' +
          ' `cannot` {by, said} is there when the entry\'s own line said, through POST /api/merge-queue/<id>/resolution with the body {"cannot":"<one sentence>"}, that the conflict cannot be resolved, or that the red tests cannot be fixed: who said it and the sentence, and the bounce begins with the speaker\'s sentence. A conflict that cannot be resolved bounces as refused, and red tests that cannot be fixed bounce as red. For a conflict, the body may add "changesWhatOneSideMeant": true when keeping both sides would change what one side meant; the resolution word "changes what one side meant" and the fixed sentence about keeping both sides come only with that field.',
        example: { reason: 'conflict', at: '2026-09-22 09:10:00', files: ['src/x.ts'], says: 'A text conflict in src/x.ts.' },
      },
      {
        key: 'resolving',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{files, red, log, mainAt, says, since, timeZone, minutes, asked, resolvedBefore, replays, nobodyStarted}: a conflict no rule joins, or tests red only with the entry, handed to the entry\'s own supervisor instead of a bounce, written when the entry went to resolving. ' +
          '`red` {tests} is there when tests were handed on: the test files red with the entry on top of main and green on main without it. `files` is then empty, `mainAt` is the main the entry was tested on, and the time to fix is the time set for resolving a conflict. Written only while MOLE_OFFICE_RED_FIXING is on. ' +
          '`says` is what the bounce would have said, without its remedy. `since` is the moment the supervisor\'s time to resolve started, as an instant with its offset, and `timeZone` the office\'s zone then. ' +
          '`minutes` is the conflict-minutes row from the Gates panel when the first conflict was handed on, fixed for this entry even after a passed resolution meets another conflict. An absent field means the 60 minutes that entry was given when it started; any value other than a whole number from 15 to 1440 leaves its end unreadable. ' +
          '`asked` {agent, brief, noBrief, message, noMessage} is whom the office asked and what it wrote at this hand-over: the agent it asks for, the absolute path of the resolve brief it wrote into that agent\'s sandbox, and the one message that asked. A missing one is absent, not null, and `noBrief` or `noMessage` says why: `noBrief` also says why no agent is named when none is. It is absent on an entry handed on before the office asked anybody. ' +
          '`asked.round` {at, status, said, run} is there when the agent had no run going and the office asked the next-round door for the brief itself, in its own process: when, the status the door answered, its words, and the run that holds the ask when the door took it. ' +
          '`resolvedBefore` {files, commit, mainAt} is there when a resolution the merge tool\'s check passed met a new conflict: the files it resolved, its commit, which refs/mole-office/resolved/<entry> still holds as a help for resolving them again, and the main it stood on. `files` then names those files and the new ones, because the check replays the entry\'s own commit again and judges every one of them in full. ' +
          '`replays` {ref, commit} is there when a fix of red tests the merge tool\'s check passed then met red tests again or a conflict: the clean copy and the check replay that fix, held at `ref`, in place of the entry\'s pinned commit. ' +
          '`nobodyStarted` {by, at, status, said} is there once the secretary\'s watcher or the person told the queue, through POST /api/merge-queue/<id>/nobody-started, that the next-round door refused to start the resolve brief, with the status and the words it answered. ' +
          'A conflict is written only while the dormant setting MOLE_OFFICE_CONFLICT_RESOLVING is on, and only on a git entry.',
        example: { files: ['src/x.ts'], mainAt: 'commit sha', says: 'It could not be put on top of the main world: a conflict the tool does not resolve. Files: src/x.ts.', since: '2026-10-17T01:10:00.000+01:00', timeZone: 'Europe/London', minutes: 60 },
      },
      {
        key: 'resolution',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{commit, workingDirectory, mainAt, files, by, at, tests, refused, checked}: the resolution of a resolving entry\'s conflict, handed over by the entry\'s own line through POST /api/merge-queue/<id>/resolution within the time set for resolving a conflict on the Gates panel. ' +
          '`commit` is the HEAD the office read in `workingDirectory` itself, standing on `mainAt`, the main the conflict met, and `files` each file the commit changes against that main, with the hash and mode of its content at the commit. ' +
          '`tests` {commit, exit, counts {passed, failed}, log, by, at} is the supervisor\'s own run of the related tests, as an agent of the line declared it with its own key at the hand-over: the commit it ran at, its exit code, how many passed and failed, and the path of its log, with who declared it and when. The office does not run them or read the log. The scoped check shows the run to the inspector, labelled as declared, and it passes or fails nothing. Absent when none was declared. ' +
          'The merge tool checks it next, mechanically: the same commits with the same messages, only the conflicted paths changed, nothing changed outside the conflict regions, the hashes and modes above, and a declared run at `commit`. ' +
          '`refused` {at, says} is written by the merge tool\'s check when it refuses this resolution: when, and its words, and the entry stays resolving so its supervisor can hand over another within the time set for resolving a conflict on the Gates panel. ' +
          'In the same write, one message tells the agent asked to resolve and the secretary the check\'s words, the refused commit and the minutes left, and `refused` keeps its id in `message`, or says in `noMessage` why none was sent. ' +
          '`checked` {at, ref, places, morePlaces, fixed} is written when the check passes: when, the ref that holds the commit in the lane\'s repository, and each place it resolved with both sides and the merge entry that landed main\'s side. For a fix of red tests, `places` is empty and `fixed` names the files the fix changes on top of the replay of the entry\'s own commits. The entry is pinned in the same write, and its turn integrates this commit and not its own. ' +
          'A later hand-over within the time set for resolving a conflict on the Gates panel replaces it.',
        example: { commit: 'commit sha', workingDirectory: '/absolute/clean/copy', mainAt: 'commit sha', files: [{ path: 'src/x.ts', hash: 'sha256 of the content', mode: '100644' }], by: { kind: 'agent', id: 'agent-id' }, at: '2026-10-17 01:40:00' },
      },
      {
        key: 'integrated',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'THE INTEGRATION RECEIPT: {entry, mainBefore, mainAfter, rebasedTip, sealId, carriedVerdict, reinspected, tests, ownerContent, placeholderCommits, at, time}. `ownerContent` is the owner-content gate\'s reminders, as `integration` holds them: what it named on the lines the entry adds to what ships and did not refuse it for. It is left out when no gate read the entry. `placeholderCommits` is each commit at the placeholder address the commit-address gate let land at remind, as `integration` holds them, and is left out when it let none through. The same receipt is written on the run that submitted the entry. Present only on a merged entry. `tests.plugin` {id, manifest} says a plugin\'s own check tested it, and not the office\'s suite. ' +
          "`time` is the clock observation beside `at`, which the queue's speed counts landings and their waits from. A receipt written before it was kept has only `at`, read as its one moment in the office's zone, and none in the hour the clocks go back or skip.",
        example: { entry: 'entry-id', mainBefore: 'commit sha', mainAfter: 'commit sha', rebasedTip: 'commit sha', sealId: 'seal-id', carriedVerdict: { run: 'run-id', by: { kind: 'agent', id: 'inspector-one' }, at: '2026-09-22 09:00:00', how: 'an inspector', paths: 7, says: 'The release covered every path.' }, reinspected: [], ownerContent: { reminded: 0, byPattern: {}, log: '/path/to/the/merge/work/owner-content.json' }, at: '2026-09-22 10:00:00', time: { stamp: '2026-09-22 10:00:00', instant: '2026-09-22T10:00:00.000+01:00', offset: '+01:00', timeZone: 'Europe/London' } },
      },
      {
        key: 'told',
        type: 'Record<string, unknown>',
        required: false,
        description: '{submitter, secretary, says}: the messages the office wrote when the entry reached its end — to the run\'s agent, its starter and the submitter on a bounce or a supersede, and the one line to whoever holds the secretary card — by record id. Null in a slot means nobody could be told, and `says` says why.',
        example: { submitter: ['message-id'], secretary: 'message-id', says: 'The submitter and the secretary were told.' },
      },
    ],
    rules: [
      'Only the merge queue writes a merge entry. Every other create, change, kind change, delete, restore and move is refused, whoever asks.',
      'A run is submitted only when it has a seal. The git changeset takes its commit and base from that seal.',
      'One entry per lane at a time: the database refuses a second entry holding the directory another entry holds.',
      'A newer entry for the same work supersedes the older one unless the older one is already landing. Same work is the same lane and, for files, the same staging folder; for git, the newer commit contains the older entry\'s commit, as an ancestor or as the same change. The folder, the branch name and the run lineage never make two git entries the same work on their own. The superseded entry keeps `superseded` {by, because, at} and `told`, and its run\'s agent, starter and submitter are sent a notice that names the newer entry and its run.',
      'An entry may be withdrawn by its submitter or the person until it starts landing.',
      "H_RELEASE: an entry is judged only when a release names its seal, its hash and its exact tip, and it is merged only on that verdict. The release is an inspector's release, or a release by the standard-change rule, which no inspector reads. A starter's own release judges nothing. A secretary's design/-only entry and the office's exact take-back are covered by their own rules instead. The verdict follows file content: a path whose hash is what the release read keeps its verdict; a changed path is judged again by a scoped check.",
      "A files entry lands only what its seal froze, or it bounces as unjudged. On a git seal every add, modify and rename that brings new bytes names an after-hash the seal holds. On a files seal every operation that brings bytes names a sealed path at its sealed hash and mode, in the root the run sealed, a rename bounces, and the release covers the before as well: a modify replaces exactly the file the check read, and an add lands where the check saw nothing. A path the files checker hands on bounces the entry as unjudged too on a git seal, because no check can read a files entry. On a files seal the check of the seal is told what the checker could not decide, and the entry waits for its release: a handed-on path is covered only when that release names it in read.needsJudgment and gives it a line of the model's own in `judged`, and a protected or generated path is never covered by a model's release alone.",
      `A merge tool run that ends without moving its entry has the tool asked for again, up to the number of merge tool runs set on the Gates panel on one arrival; then the entry bounces as stalled, or, while landing, stays and the secretary is told.`,
      "A delete in a files changeset waits for the secretary's confirmation before the entry may land.",
    ],
    example: {
      run: 'run-id',
      seal: { id: 'seal-id', hash: 'sha256 of the seal' },
      changeset: { adapter: 'git', root: '/srv/mole-office-fixtures/checkout', repository: 'repository-id', branch: 'work', commit: 'commit sha', base: 'commit sha' },
      state: 'submitted',
      submittedBy: { kind: 'agent', id: 'agent-id' },
      submittedTime: { stamp: '2026-09-21 23:00:00', instant: '2026-09-21T23:00:00.000+01:00', offset: '+01:00', timeZone: 'Europe/London' },
      toolWanted: { since: '2026-09-21 23:00:00' },
    },
}
