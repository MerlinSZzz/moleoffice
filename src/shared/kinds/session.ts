// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `session`, one agent working session — what it is doing,
 * whether it is still alive, and how it ended.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields`, `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, the session states from ../types.ts, the runtime words from
 * ../participants.ts, the ended-run look field from ../ended-run-resources.ts, the test-world
 * stop key from ../worlds.ts, the attachment close words from ../lifecycle.ts, the fork-base
 * sentence from ../kind-fields/session-wave-13n.ts, the check words from ../releasing.ts, the
 * trace field from ./block-fields.ts, the reasons a reminder was not made from
 * ../before-the-seal-reasons.ts, what an item is about from ../before-the-seal.ts, and the usage
 * receipt numbers from ../usage-receipts.ts, the review levels from ../workspaces.ts, and the
 * method-work words from ../design-reminders.ts. `SESSION_SHAPES` holds the session kind's shapes
 * as they move out of ../kinds.ts, with their comments and text unchanged.
 */
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { SESSION_STATES } from '../types.ts'
import { enWave14c } from '../words/en-wave-14c.ts'
import { AGENT_RUNTIMES } from '../participants.ts'
import { ENDED_RUN_LOOK_FIELD } from '../ended-run-resources.ts'
import { THE_WORLDS_STOP_KEY } from '../worlds.ts'
import { WHO_MAY_CHECK } from '../releasing.ts'
import { tracedField } from './block-fields.ts'
// HOW AN ATTACHMENT ENDED, from the one place the lifecycle words are declared. The `session`
// record IS the attachment — see the block on `closedHow` below — so its close word has to be the
// same list `src/server/lib/attachments.ts` writes and no second copy of it.
import { CLOSED_HOW } from '../lifecycle.ts'
import { A_CUT_FROM_MAY_NOT_START_WITH_A_DASH } from '../kind-fields/session-wave-13n.ts'
import { WHY_NOT_REMINDED } from '../before-the-seal-reasons.ts'
import { WHAT_IT_IS_ABOUT } from '../before-the-seal.ts'
import { USAGE_NUMBERS } from '../usage-receipts.ts'
import { REVIEW_LEVELS } from '../workspaces.ts'
import { METHOD_WORKS } from '../design-reminders.ts'

// THE THREE FIELDS OF A SEAL THAT COUNTS ONLY ITS RUN'S OWN COMMITS (wave 13n; src/server/lib/a-runs-own-commits.ts).
// A run's `filingHead` and `endHead` are below. A seal's `carriedCommits` is on the sealed_tip kind.
export const FILING_HEAD = 'filingHead'
export const END_HEAD = 'endHead'
export const CARRIED_COMMITS = 'carriedCommits'

/**
 * THE FIELDS OF A RUN ONLY THE OFFICE WRITES, which it may write as the run is filed: `filingHead` always, and `endHead`
 * too when the run is filed already finished. The create and change doors refuse both. A program that compares a run's
 * first revision with the data it sent leaves these out (tools/main-suite-fix-round-author.mjs).
 */
export const THE_HEADS_ONLY_THE_OFFICE_WRITES = [FILING_HEAD, END_HEAD] as const

export const sessionKind: KindSpec = {
    kind: 'session',
    purpose: 'One agent working session: what it is doing, whether it is still alive, and how it ended.',
    whenToRecord:
      'When an agent run starts. Update `state` and `lastOutputAt` as it goes and `detail` when it ends. A crashed ' +
      'session is the one thing on the alarm panel that nobody else will notice for you.',
    humanOnly: false,
    fields: [
      { key: 'territory', type: 'string[]', required: false, description: 'The repository files this run means to change, at any depth. A run that changes every file in a folder writes it as folder/**. A folder written without /** is read as one the run works in, and meets no other run\'s files. Another running run that names one of the same files gets a group with this run\'s line. At the default setting, remind, nothing is refused for an overlap.', example: ['src/server/lib/claims.ts', 'src/shared/words/**'] },
      { key: 'executionId', type: 'string', required: false, description: 'The execution this submitted attempt belongs to, when recorded.', example: 'execution-id' },
      { key: 'attemptId', type: 'string', required: false, description: 'The execution attempt being submitted, when recorded.', example: 'attempt-id' },
      {
        key: 'submission',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'WHAT THIS RUN SUBMITS, read when it finishes and sealed then. `kind` is git, records, mixed or files; absent ' +
          'means git. Record work names its record ids in `records`, and the office captures their revisions at the ' +
          'finish. A FILES RUN, whose work is a folder of files that was never in any ' +
          'repository, names `stagedAt`, the absolute folder its files are staged in, and `root`, the absolute folder ' +
          'they will land in: each file at `<stagedAt>/<path>` lands at `<root>/<path>`, and the seal holds each ' +
          "one's path, sha256 and mode, with no git at all. It may name, in `sources`, each file's original: " +
          '`{"<path>": "<absolute path>"}`, or `{"<path>": {"path": "<absolute path>", "transform": "trailing-nul-trim"}}` for ' +
          "a copy with its trailing NUL padding cut off. The seal records each original's real path and its sha256 then, " +
          'and whether the run could have written where it lies, from the sandbox folder the office recorded for it. ' +
          'A GIT RUN MAY DECLARE A STANDARD CHANGE in `standard`, one of one-plugin, words, tests and documents; the seal ' +
          'keeps it, and the check tool then asks POST /api/checks/<run>/standard to release the run without an inspector. ' +
          'Any other value, or `standard` on a seal that is not git, is refused and nothing is sealed.',
        example: { kind: 'files', stagedAt: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/files-1/out/round-8/staged', root: '/srv/mole-office-fixtures/projects/greenhouse' },
      },
      { key: ENDED_RUN_LOOK_FIELD, type: 'string', required: false, description: 'The end time the office recorded for a pending later resource look. Written only when open rows remain at run end, and cleared after the look. Old runs carry no mark.', example: '2026-10-01 16:00:00' },
      { key: 'sealedTip', type: 'string', required: false, description: 'The immutable seal the office wrote at finish. Callers cannot write this field.', example: 'seal-id' },
      { key: 'compactions', type: 'ReportedCompaction[]', required: false, description: 'Each compaction this run\'s runtime reported, oldest first. The session hook appends one when Claude Code starts the session again with SessionStart source "compact". Absent means none was reported, which is not the same as none having happened. Stored in session data; no migration is needed.', example: [{ at: '2026-10-10 09:12:00', what: 'Claude Code reported a compaction (SessionStart source compact)' }] },
      { key: 'usageReceipt', type: 'UsageReceipt', required: false, description: 'The runtime receipt read at the end of this run. Absent means no receipt was recorded. Stored in session data; no migration is needed.', example: { runtime: 'codex', source: '--json turn.completed usage', inputTokens: 0 } },
      { key: 'startSteps', type: 'StartStepReading[]', required: false, description: 'What each office-flow step of this start cost in time, written by the office from its own call log the first time it measured an ended start. Absent means no step table was ever stored; a part of a step with no reading is an absent key, never a zero. Survives the pruning of api_calls. Stored in session data and no migration is needed.', example: [{ name: 'restoring', says: "The reads that restored the project's knowledge before the run wrote anything outside its own session record.", operations: ['project.onboarding'], requests: 1, firstAt: '2026-09-15 10:40:00', lastAt: '2026-09-15 10:40:02', spentMs: 2000 }] },
      {
        key: 'served',
        type: 'Served',
        required: false,
        description:
          'WHAT THIS RUN\'S RUNTIME SERVED IT: the model the provider\'s responses carried, the configured ' +
          'temperature, the brief\'s size in bytes, and the context the provider reported — the run\'s conditions. ' +
          'Written by the runner through the ordinary session door at the run\'s end, from the run\'s ' +
          'own transcript, and never by hand except from the person or the secretary (the record\'s history says who ' +
          'wrote it). Each field the runtime gave nothing for holds the words "not reported". An old session without ' +
          'this key reads as "not recorded" at GET. Absent is NOT the same as a field holding "not reported": the ' +
          'first is nobody has ever recorded the run\'s conditions, the second is a runner that looked and saw none.',
        example: { model: 'deepseek-flash', temperature: 1.3, briefBytes: 4207, contextTokens: { largestTurn: 11163, total: 231801 } },
      },
      {
        key: THE_WORLDS_STOP_KEY,
        type: 'Record<string, unknown>',
        required: false,
        description:
          'The test-world outcome after this run was confirmed: says holds the sentence; ' +
          'stopped names worlds with at least one group sent SIGTERM; leftForThePerson names shown worlds; ' +
          'notChecked names worlds with failed checks or signals. A partially stopped world can appear in both ' +
          'stopped and notChecked. Absent means no outcome was stored. The closing message is never edited.',
        example: { says: 'World "test" was stopped.', stopped: ['test'], leftForThePerson: [], notChecked: [] },
      },
      {
        key: 'honour',
        type: 'HonourBoardReading',
        required: false,
        description:
          'WHAT THE OFFICE READ OFF THIS RUN when it marked it for the honour board: the five ' +
          'signals it read from the records this run left, the ones it could not read and why, the standing those ' +
          'signals name, and what the reading cost. Written by the office either when the run is closed (the ' +
          'supervisor\u2019s confirm presses it) or when the read door POSTs again, and never on a timer and never by ' +
          'the person: a hand whose value says the office earned a signal it never read. Absent means nobody has read this ' +
          'run yet, which is every run not yet closed down, and not the same as a reading with nothing in it.',
        example: { read_at: '2026-09-16 12:00:00', standing: 'exemplary', threshold: 2, signals: [{ signal: 'found a real defect outside its brief', evidence: ['P1bld'], read_at: '2026-09-16 12:00:00' }], missing: [{ signal: 'needed no rework', because: 'no check was asked for this run' }], cost: { records: 214, ms: 38 } },
      },
      {
        key: 'state',
        type: unionOf(SESSION_STATES),
        required: true,
        description:
          'running = output in the last few minutes. idle = alive but has said nothing for a while, usually waiting on ' +
          'you. finished = exited cleanly. crashed = died or stopped without finishing. paused = stopped on purpose by a ' +
          'shutdown of Mole Office, with its conversation kept; it never resumes by itself (`paused` says who, when and ' +
          'why). Needed before the session is ' +
          'complete: one with no readable state cannot be ranked on the alarm panel, and guessing a state for it ' +
          'would hide a crashed run behind a cheerful "finished".',
        example: 'crashed',
      },
      {
        key: 'runtime',
        type: 'string',
        required: false,
        description:
          'WHICH TOOL RAN THIS PROCESS: "claude-code", "codex-cli". The same word `agent.runtime` uses, because ' +
          'it is the same fact. It replaces the field called `agent` below, which now means something else in ' +
          'this product: an agent is a durable identity with its own record, and a session is one run of a tool.',
        example: 'claude-code',
      },
      {
        // NAMED adaptedTool BECAUSE THAT IS WHAT IT HOLDS: one of the tools Mole Office has an adapter
        // for (AGENT_RUNTIMES), and nothing else. `runtime` above stays the free word; this is the field
        // that is counted (problem uh6-H72Zik9H), by option 3 of a decision.
        key: 'adaptedTool',
        type: unionOf(AGENT_RUNTIMES),
        required: false,
        description:
          'WHICH TOOL MOLE OFFICE ADAPTS RAN THIS, declared by whoever started or registered the run. It is one ' +
          'of the tools this product has an adapter for, and it is the field the usage page counts runs by. ' +
          '`runtime` above is kept as it was written and may hold any word. Absent means nobody declared the ' +
          'tool, which is every run filed before this field existed, and it is counted as "not declared" ' +
          'rather than guessed from `runtime`.',
        refusal:
          'this field is counted as the tool a run used, so it takes only a tool Mole Office adapts. A word ' +
          'for anything else goes in `runtime`, which takes any word',
        example: 'claude-code',
      },
      {
        key: 'ranProgram',
        type: 'string',
        required: false,
        description:
          'THE PROGRAM THAT RAN THIS, by its whole path on the machine. `runtime` above is the word for the tool; ' +
          'this is the file that actually ran. It is written because a machine can hold the same tool twice, and ' +
          'PATH decides which one answers: this machine held Codex at /usr/local/bin/codex and again under nvm ' +
          'until the owner removed the older one on 5 September 2026, and a run naming only "codex" could not say ' +
          'which of them it had been. Written by the message worker from the path it resolved. ' +
          'Absent means nobody recorded one, which is every run started before this was written.',
        example: '/srv/mole-office-fixtures/.nvm/versions/node/v22.23.2/bin/codex',
      },
      {
        key: 'ranProgramVersion',
        type: 'string',
        required: false,
        description:
          'WHAT THAT PROGRAM SAID ITS VERSION WAS, in its own words. The worker runs `<the path above> --version` ' +
          'once when it starts and stores the line it printed. WHEN IT COULD NOT BE READ, the sentence saying why ' +
          'is stored here instead — the program is not on this PATH, it exited non-zero, it printed nothing — ' +
          'because a run whose version nobody could read and a run nobody asked about are different facts, and ' +
          'neither is a version. Absent means nobody asked.',
        example: 'codex-cli 0.147.0',
      },
      {
        key: 'model',
        type: 'string',
        required: false,
        description:
          'WHICH MODEL THIS RUN WAS GIVEN, in the word the tool was passed. Written by the message ' +
          'worker from MOLE_OFFICE_AGENT_MODEL, which is the one setting every run the office starts reads. ' +
          'ABSENT MEANS NOBODY RECORDED ONE, which is every run started before 8 September 2026: until then no ' +
          '--model was passed at all, so those runs took whatever the person\u2019s own tool was configured with ' +
          'and there is no way to find out which. It is not a price and it is not a guess at one: it is the ' +
          'argument that went to the command, which is the only thing this product can honestly say.',
        example: 'opus',
      },
      {
        key: 'effort',
        type: 'string',
        required: false,
        description:
          'WHAT EFFORT THIS RUN WAS GIVEN, in the word the run declared. It is a free ' +
          'string and not a list of levels: a runtime that names its effort says the word it uses, and ' +
          'this product does not turn one runtime\u2019s word into another\u2019s. ABSENT MEANS THE RUN DID ' +
          'NOT SAY, which is not "medium" and is not a default — every run started before this field ' +
          'existed, and every runtime that declares no effort, carries none. Like `usageReceipt` it is ' +
          'stored in the session data and no migration is needed.',
        example: 'high',
      },
      {
        key: 'ranAs',
        type: 'RanAs[]',
        required: false,
        description:
          'WHICH DURABLE AGENT THIS RUN WORKED AS, per project. Absent means nobody said, which is what every ' +
          'session written before durable agents existed holds. At most one entry per project: a second bind ' +
          'naming a different agent for a project this run is already filed under is refused, not overwritten.',
        example: [{ workspaceId: 'greenhouse', agentId: 'aGtxQ1xBvNa2' }],
      },
      { key: 'doing', type: 'string', required: false, description: 'What it is doing, or was doing when it died, in one line.', example: 'trial 14/20 — holding force 11.8 N at setting 12' },
      {
        key: 'lastOutputAt',
        type: 'date',
        required: false,
        description:
          'When it last produced output, in local time. This is the clock the "idle for 40 minutes" reading is made ' +
          'against; leave it out rather than writing "now", and the record\'s own updatedAt is used instead.',
        example: '2026-08-06 23:15:00',
      },
      {
        key: 'startedAt',
        type: 'date',
        required: false,
        description:
          'When the run began, in local time; for a worker, observed just after the worker spawned the process. Leave it ' +
          'out when nobody knows when the run began, rather than writing when the record was made. Its page then shows the ' +
          'start this office read from the run\'s process, when the record names its process and the ledger read that ' +
          'same start time for it; otherwise it says the start time is unknown and when the office first recorded the run.',
        example: '2026-10-25 01:30:00',
      },
      { key: 'filedTime', type: 'ClockStamp', required: false, description: 'Instant beside the stamp the record door filed the run at, from the one reading of the clock that made it. The record door writes it when the run is filed, in place of any value sent with the filing. Missing on a run filed before the office kept it.', example: { stamp: '2026-10-25 01:30:00', instant: '2026-10-25T01:30:00.000+00:00', offset: '+00:00', timeZone: 'Europe/London' } },
      { key: 'startedTime', type: 'ClockStamp', required: false, description: 'Instant beside startedAt. Missing on older runs and when no instant was recorded.', example: { stamp: '2026-10-25 01:30:00', instant: '2026-10-25T01:30:00.000+01:00', offset: '+01:00', timeZone: 'Europe/London' } },
      {
        key: 'waitedForASeatSeconds',
        type: 'number',
        required: false,
        description:
          'How long the check waited for a test-batches seat before its model or standard check could run, in ' +
          'whole seconds, added up over every seat it asked for. Absent means no seat line was read from the ' +
          "check's output; that is not the same as a wait of zero.",
        example: 12,
      },
      { key: 'lastOutputTime', type: 'ClockStamp', required: false, description: 'Instant beside lastOutputAt. This is not an active interval. A local-only transcript timestamp supplies no instant.', example: { stamp: '2026-10-25 01:30:00', instant: '2026-10-25T01:30:00.000+00:00', offset: '+00:00', timeZone: 'Europe/London' } },
      { key: 'lastOutputTimeSource', type: "'output-file-mtime' | 'transcript-timestamp'", required: false, description: 'Where the last output instant was observed. File modification is read when the worker reads the result; a transcript timestamp is stated by the provider.', example: 'output-file-mtime' },
      { key: 'answeredAt', type: 'date', required: false, description: 'Local time when the worker observed a successful result, before filing the reply. This is not the provider exit time.', example: '2026-10-25 01:30:00' },
      { key: 'answeredTime', type: 'ClockStamp', required: false, description: 'Instant beside answeredAt. Missing means no successful result observation was recorded.', example: { stamp: '2026-10-25 01:30:00', instant: '2026-10-25T01:30:00.000+00:00', offset: '+00:00', timeZone: 'Europe/London' } },
      {
        key: 'paused',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'WHEN, BY WHOM AND WHY A SHUTDOWN OF MOLE OFFICE PAUSED THIS RUN, written by the shutdown ' +
          'door and by nothing else: {at, time, by, because}. `at` is local time, `time` the ClockStamp beside it, ' +
          '`by` the person or agent who asked for the shutdown as {kind, id} (null when it was neither), and ' +
          '`because` one plain sentence. Present exactly when the state is or was paused. One field rather than ' +
          'four, so the compact read of this kind stays within its budget.',
        example: { at: '2026-10-03 09:30:00', time: { stamp: '2026-10-03 09:30:00', instant: '2026-10-03T09:30:00.000+01:00', offset: '+01:00', timeZone: 'Europe/London' }, by: { kind: 'person', id: 'owner' }, because: 'owner shut Mole Office down.' },
      },
      {
        key: 'resume',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'A PRESS TO RESUME THIS INTERRUPTED RUN, and what became of it: {askedBy, askedAt, startedAs, startedAt, failed}. ' +
          '`askedBy` is the person who pressed resume as {kind, id}; `startedAs` is the run that took the conversation up ' +
          'again; `failed` is why the resume could not start, in the message worker\'s words. Written by the resume door ' +
          'and the worker, and by nothing else. One field rather than five, so the compact read of this kind stays ' +
          'within its budget.',
        example: { askedBy: { kind: 'person', id: 'owner' }, askedAt: '2026-10-03 10:00:00', startedAs: 'r7K2mQ1xBvNa', startedAt: '2026-10-03 10:00:04' },
      },
      { key: 'detail', type: 'string', required: false, description: 'How it ended, in the words the exit gave you. "Crashed" alone tells you nothing about whether to restart it.', example: 'exit 137, out of memory while collating the force tables' },
      { key: 'workspace', type: 'string', required: false, description: 'Which project directory it was working in — the LAST SEGMENT of the path, e.g. `greenhouse`. `workingDirectory` below holds the whole path and is the one to write; Mole Office takes this short name from it. It is still declared because 103 records carry it and no path can be recovered from a name.', example: 'greenhouse' },
      {
        key: 'raises',
        type: 'Raise[]',
        required: false,
        description:
          'EVERY RAISE THE PERSON PRESSED WHILE THIS RUN WAS THE SECRETARY\'S, oldest first, with its start and its end, ' +
          'written since 26 September 2026. Written by the press at POST /api/roles/elevation/<handle> and ' +
          'its end, and by nothing else. It grants nothing by being here: the grant on the agent record is what a ' +
          'refusal reads. A new run of the same secretary does not inherit a raise.',
        example: [{ elevation: 'elevation-20260926190000-a1b2', from: '2026-09-26 19:00:00', until: '2026-09-27 19:00:00', reason: 'Delete the decision record filed by mistake' }],
      },
      {
        key: 'sandbox',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'THE SANDBOX THIS RUN HAPPENED IN, when it did not run on the host. A sandbox is a container ' +
          'built from a template under `sandboxes/` — it is not a world: there is no database inside it and ' +
          'no fifth kind of world, only the host / main world (`worlds.ts`) doing the work somewhere else. ' +
          'Written once, by the launcher that started this run, before the run\'s model starts, and never guessed ' +
          'at afterwards: `template`, the sandbox template\'s name; `container`, the resources-ledger id of the ' +
          '`container` row that sandbox is registered as, so the ledger and this session read the same fact rather ' +
          'than two that can drift; and `folder`, the instance folder the launcher was given. A FILES SEAL READS ' +
          '`folder` TO SAY WHERE THE RUN COULD NOT HAVE WRITTEN. It counts only while the ' +
          '`container` row names that same folder; a folder no such row vouches for counts as none, and then no ' +
          'original is taken as out of the run\'s reach. Because the seal trusts it, the office refuses ' +
          'this field from the run\'s own agent, and any change to it once set from anybody but the person. ' +
          'ABSENT MEANS THIS RUN HAPPENED ON THE HOST, the main world, which is every run before sandboxes ' +
          'existed and every run since that no sandbox launcher started.',
        example: { template: 'mole-office-dev', container: 'V1StGXR8_Z5j', folder: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/files-1' },
      },

      // ------------------------------------------------------------------- the attachment's own facts
      //
      // A SESSION RECORD IS AN ATTACHMENT: one period in which one provider session took part as one
      // durable agent. The eight keys below are what that period knows about itself, and they are
      // keys on this record rather than a new kind or a new table.
      //
      // WHY THERE IS NO `attachments` TABLE. A table would buy one thing a JSON bag cannot have — a
      // partial unique index, the way `session_resources_live_idx` gives "one live row per resource".
      // The index it would enforce is one open attachment per (agent, provider session), and that
      // constraint is WRONG: measured on this machine on 27 August 2026, three live `claude`
      // processes share one provider session id, 41 days old, in one directory. Two of the three
      // could not be recorded under such an index. The check actually wanted is one open attachment
      // per (agent, process), and that is a query in src/server/lib/attachments.ts.
      //
      // WHAT THAT COSTS, SAID RATHER THAN DISCOVERED: nothing in the database stops two open
      // attachments existing for one agent and one provider session. The writer checks. A check is
      // weaker than a constraint and this is where that is written down.
      //
      // THERE IS NO `openedAt`. The record's own `createdAt` is when the attachment opened, and a
      // second stamp for it would be the same fact in two places.
      {
        key: 'providerSession',
        type: 'string',
        required: false,
        description:
          'THE PROVIDER\'S OWN ID FOR THIS CONVERSATION — the thing a resume is asked for. For Claude Code it is ' +
          'the uuid in the SessionStart hook; for Codex it is the id `codex resume` takes. It does NOT identify a ' +
          'process and does not promise that only one process is in the conversation: three live processes on this ' +
          'machine share one of these today. Absent means nobody recorded one, so nothing can resume this run.',
        example: '00000000-0000-0000-0000-000000000000',
      },
      {
        key: 'startedByMoleOffice',
        type: 'boolean',
        required: false,
        description:
          'TRUE WHEN MOLE OFFICE ITSELF STARTED THIS PROCESS AND NOTHING ELSE IS HAPPENING IN THIS SESSION, so ' +
          'stopping the process ends the session and a person may stop it from the product while it is still ' +
          'running. Only the API server and the message worker write it, because since 3 September ' +
          '2026 Mole Office may start processes on this machine. Absent on every session a person or an agent ' +
          'started for itself, and those are never stopped from here.',
        example: true,
      },
      {
        key: 'servingAgent',
        type: 'string',
        required: false,
        description:
          'WHICH DURABLE AGENT THIS RUN IS, by the name whoever filed the run used for it. Every writer in this ' +
          'repository writes the agent\'s handle: the message worker, the merge state machine and ' +
          'tools/register-a-run.mjs. A row the message worker filed before 23 September 2026 may hold a registry ' +
          'id instead, because that writer stored whatever the message was addressed to. So this is a STORED ' +
          'reference and not a settled identity: read it with the stored readers in ' +
          'src/server/lib/agent-references.ts, which take an exact id first, then the one agent bearing the string ' +
          'as a handle, and no agent where more than one answers. `servingAgentId` below holds the registry id, ' +
          'and that is the field to read when the identity itself is wanted. `ranAs` above is the older, ' +
          'per-project binding of a run to an agent RECORD. Absent where whoever filed the run recorded no agent ' +
          'for it.',
        example: 'builder-cj',
      },
      {
        key: 'servingAgentId',
        type: 'string',
        required: false,
        description:
          'THE REGISTRY ID OF THE AGENT THIS RUN SERVES, written beside `servingAgent` by whatever started the ' +
          'run. `servingAgent` holds the name the starter used, which is usually the handle; this holds the id of ' +
          'the row in the agent registry, so a later reader never has to resolve a name that two agents could ' +
          'answer. Absent on every run filed before 23 September 2026 and on any run whose starter did not record ' +
          'it. Absent here is not the same as a run that serves no agent: that run has no `servingAgent` either.',
        example: 'aGtxQ1xBvNa2',
      },
      {
        key: 'deliveringMessage',
        type: 'string',
        required: false,
        description:
          'THE MESSAGE THIS RUN WAS STARTED TO DELIVER, by its record id. Written by the message worker, which ' +
          'starts one run per message to an agent. It is how the runtime page counts runs in flight and how a ' +
          'reader gets from a run back to the words that caused it. Absent on every other kind of run.',
        example: 'NAKz9LZd928j',
      },
      {
        key: 'filingRefused',
        type: 'string',
        required: false,
        description:
          'WHY A MESSAGE THIS RUN TRIED TO FILE WAS REFUSED. One run may file MOLE_OFFICE_RUN_MESSAGES messages ' +
          'through the message worker, and the next one is refused with a sentence naming the limit and the run. ' +
          'The sentence is written here as well as on the delivery row, because a run that was cut short should say ' +
          'so on its own record rather than only in an answer nobody kept. Written by Mole Office, never by the run.',
        example: 'Run aGtxQ1xBvNa2 has filed 5 messages, and this installation allows one run 5.',
      },
      {
        key: 'expectedMinutes',
        type: 'number',
        required: false,
        description:
          'HOW LONG THIS STEP WAS EXPECTED TO TAKE, in whole minutes, typed by whoever started the task — at the ' +
          'start door (the person\u2019s press on the message) or on this record afterwards. It is the only trigger ' +
          'expected-time reminder reads: at one typed duration the office sends the agent a mild ' +
          'reminder needing no reply, at TWICE the typed duration it tells the agent to tell its supervisor why ' +
          'it is stuck: the second checkpoint is the second occurrence of the expected time, so the escalation ' +
          'falls at 2T. That is how the office reads the rule, not arithmetic the rule stated. ABSENT MEANS NOBODY TYPED ONE, and then NOTHING is ' +
          'reminded about this run — no default exists, because a guessed duration would remind healthy runs ' +
          'about a deadline nobody set. The token half of the reminder is not built: step budgets and the step log ' +
          'were withdrawn on 11 September 2026, and a run\u2019s token count is known only after the run ' +
          'exits, so no running run can honestly be judged by one.',
        example: 60,
      },
      {
        key: 'waitsUntil',
        type: 'string',
        required: false,
        description:
          'WHEN THIS RUN STOPS HOLDING ITS CONVERSATION OPEN FOR THE NEXT MESSAGE, as local wall-clock time. A run ' +
          'answers and its process ends, but the tool can pick that conversation up again by its own id, so until ' +
          'this moment the next message to that agent is answered inside it. Written by Mole Office when the run\u2019s ' +
          'answer is filed, MOLE_OFFICE_RUN_WAITS_MINUTES minutes ahead, and only for a run that said a ' +
          '`providerSession`: a conversation nothing can pick up has nothing to wait for. Absent on every run that ' +
          'never waited. The wait ENDING is not stored beside it \u2014 what says so is the line Mole Office writes in ' +
          'the conversation, which carries `aboutRun`.',
        example: '2026-09-04 15:12:40',
      },
      {
        key: 'machine',
        type: 'string',
        required: false,
        description:
          'WHICH MACHINE THIS RUN WAS ON, in that machine\'s own name for itself. It is what makes "the transcript ' +
          'is not on this machine" a different answer from "the transcript is gone". Leave it out when it is this ' +
          'one, as the file kinds do, and the row closers then read it as this machine and leave a row that names ' +
          'another one alone. Absent on every row already on the record.',
        example: 'desk-pc',
      },
      {
        key: 'workingDirectory',
        type: 'string',
        required: false,
        description:
          'THE WHOLE PATH THE RUN WAS WORKING IN. A resume needs the path, and `workspace` above holds only the ' +
          'last segment of it, which nothing can turn back into a path. It is not a project: a directory name is ' +
          'not a workspace id and Mole Office never reads one as the other.',
        example: '/srv/mole-office-fixtures/mole-office',
      },
      {
        key: 'conversationSync',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'THE SCRUBBED COPY OF THIS RUN\'S OWN CONVERSATION FILE, when the person has turned the per-workspace ' +
          'conversation sync on and this run\'s file was read. It holds `state` (synced, missing, unreadable, ' +
          'too-large, deleted or not-synced), the run\'s stored `runtime`, its `providerSession`, the `source` path ' +
          'with the path tokens in it, the file\'s `sha256` and `bytes`, when it was captured and when the copy last ' +
          'changed, how many secret-shaped pieces were replaced and which shapes they were, how many absolute home or ' +
          'checkout paths were mapped, one `says` sentence, and `text`, the scrubbed transcript. A missing or unreadable ' +
          'file keeps the last copy and says so; a deleted file is `deleted`, never an empty conversation. The path map ' +
          'is on the workspace\'s sync setting, not here. Absent means the sync has not copied this run. WRITTEN BY THE ' +
          'SYNC ITSELF, from the runtime\'s own file, and never by hand.',
        example: { state: 'synced', runtime: 'claude-code', providerSession: 'made-up-conversation', source: '<home>/.claude/projects/<checkout:1>/made-up-conversation.jsonl', sha256: '3f1c9a02b7de4415b8d0d2ec0f7b6a5e5d4c3b2a1908070605040302010f0e0d', bytes: 12034, capturedAt: '2026-11-10 06:00:00', lastChangedAt: '2026-11-10 06:00:00', secretsRemoved: 1, secretShapes: ['apiKey'], pathsMapped: 3, says: 'Read the conversation file: 12034 bytes, 1 secret-shaped piece replaced and 3 path occurrences mapped.', text: '{"type":"summary"}\n' },
      },
      {
        key: 'whatTheCheckWouldRead',
        type: 'WhatTheCheckWouldRead',
        required: false,
        description:
          'WHAT A CHECK OF THIS RUN WOULD READ, from the last assembly of it. The five things ' +
          '`node tools/the-inspector.mjs --dry` prints — the prompt size, the chapters written out, the changed ' +
          'files inside the work area and the ones outside it, and the base they were read against — kept here ' +
          'so a person reads them in Mole Office rather than in the terminal they were printed to: nobody may be ' +
          'asked to run a command in a terminal, and everything must be possible inside Mole Office. WRITTEN THROUGH ' +
          'POST /api/checks/<run>/assembled, because two of the five need a working tree and nothing in this ' +
          'server reads one. ABSENT MEANS NOBODY HAS ASSEMBLED A CHECK for this run yet.',
        example: {
          at: '2026-09-07 18:04:00',
          bytes: 171420,
          wholeCodeBytes: 219544,
          chaptersAt: [{ chapter: 5, level: 'full', bytes: 18422 }],
          inside: ['src/server/lib/inspection.ts'],
          outside: ['src/web/pages/RecordPage.tsx'],
          says: '171420 bytes, where the whole of the office regulations at full would have been 219544.',
        },
      },
      {
        key: 'theCheck',
        type: 'TheCheckTheOfficeAskedFor',
        required: false,
        description:
          'WHAT THE OFFICE DID WHEN THIS RUN SAID ITS WORK WAS FINISHED. Nobody keeps a terminal open for the ' +
          'inspector: Mole Office starts one itself. When a run declares a finish, the office writes the inspector a message and the message ' +
          'worker starts the run from it, the way it starts every run; nobody holds a terminal and nobody types ' +
          'a command. This says when it asked, which inspector it asked (null where nobody holds the card, and ' +
          'then the starter is told instead), the message that starts the run, and the checkout it named. It is ' +
          'also what stops a second inspector being started on a run patched to finished twice. WRITTEN BY THE ' +
          'OFFICE AND NOT BY A CALLER: a value somebody sends here is a claim that a check was asked for that ' +
          'nobody asked for.',
        example: {
          askedAt: '2026-09-07 18:04:00',
          askedOf: 'permissions-drafter',
          message: 'FXxn0p80h_iQ',
          checkout: { directory: '/srv/mole-office-fixtures/.cache/mole-office/worktrees/code-3', cutFrom: 'main' },
          says: 'The office asked permissions-drafter, who holds the inspector card, to check this run.',
        },
      },
      {
        key: 'tip', type: 'string', required: false,
        description: 'The submitted Git commit id, paired with cutFrom when the recorded working directory cannot resolve HEAD. This records a submission; it does not seal file contents.',
        example: '1625e4a40000000000000000000000000000000000',
      },
      {
        key: 'cutFrom',
        type: 'string',
        required: false,
        description:
          "WHICH BRANCH THIS RUN'S CHECKOUT WAS CUT FROM, by name. It is what makes a check about this run and " +
          'not about everybody else: an inspector reads the changes against the FORK POINT, the merge base of ' +
          'the checkout and this branch, so nothing that happened on that branch after the cut is put to this ' +
          'run. ABSENT MEANS NOBODY SAID, and the office then reads the trunk from the repository itself: the ' +
          'remote HEAD, or whichever one of the local branches main and master exists, and where neither or ' +
          'both of those exist it refuses and names cutFrom as the way through. Measured on 7 September 2026: ' +
          "the first real check was assembled against a commit that is not an ancestor of the branch at all, " +
          "and eight files of other people's work went into the diff the inspector was asked to hold the run to. " +
          `Refused when it is written: ${A_CUT_FROM_MAY_NOT_START_WITH_A_DASH}`,
        example: 'main',
      },
      {
        key: 'flow',
        type: 'string',
        required: false,
        description:
          'THE ID OF THE FLOW RECORD THIS RUN FOLLOWS, as its launcher named it. The office reads it once, when the ' +
          "session is filed, and writes the run's flow run from it: the flow and its newest revision at that moment. " +
          'ABSENT MEANS THE RUN NAMED NO FLOW, and the flow run says exactly that; the office never guesses one. An id ' +
          'that names no flow record is kept, and the flow run says no flow record has it. Wave 1 of the office ' +
          'flow, M1: nothing is refused or stopped because of this field.',
        example: 'Xq3flowRec01',
      },
      {
        key: 'terminal',
        type: 'string',
        required: false,
        description:
          'WHERE A PERSON CAN GO AND WATCH THIS RUN, when the provider says — a tmux pane such as `baseline:@15.%44`. ' +
          'IT IS RECORDED AND NEVER WRITTEN TO. Sending keystrokes into a terminal whose state nobody knows is ' +
          'refused, and whether it may ever be written to is an open question for the owner. Absent for most runs: ' +
          'measured, 2 of the 12 live sessions on this machine offer one.',
        example: 'baseline:@15.%44',
      },
      {
        key: 'parentAttachment',
        type: 'string',
        required: false,
        description:
          'THE ATTACHMENT THAT STARTED THIS ONE, by record id, when this run is a provider\'s own child run. A child ' +
          'is observed and kept under its parent; it is NOT a durable agent, not a work-domain owner and not ' +
          'somebody a message can be addressed to. Absent means this run is not a child, which is the ordinary case.',
        example: 'r7K2mQ1xBvNa',
      },
      {
        key: 'closedAt',
        type: 'date',
        required: false,
        description:
          'WHEN THIS PERIOD OF PARTICIPATION ENDED, in local time. Absent means the attachment is still open. ' +
          'CLOSING IT TOUCHES NO PROCESS: the provider may still be running, and stopping a process is a separate ' +
          'act on the “Running on this machine” list. A closed attachment is never reopened — a new run is a new attachment.',
        example: '2026-08-27 18:40:00',
      },
      {
        key: 'closedBecause',
        type: 'string',
        required: false,
        description:
          'WHY IT ENDED, in one plain sentence, in the words of whoever ended it. `closedHow` says which kind of ' +
          'evidence that was; this says what happened. A close with no reason is refused.',
        example: 'The review it was opened for was filed and the agent said it was finished.',
      },
      {
        key: 'closedHow',
        type: unionOf(CLOSED_HOW),
        required: false,
        description:
          'WHICH OF SIX THINGS ENDED IT. agent-said = the agent said so. provider-event = the provider said the run ' +
          'ended. parent-said = the attachment that started this one said so. went-stale = nobody said, and Mole Office ' +
          'stopped hearing from it. person-said = a person closed it. starter-said = whoever is recorded as having ' +
          'started the agent this run served closed it. THE WORD MATTERS BECAUSE A RUN THAT ENDED AND ' +
          'A RUN WE STOPPED HEARING FROM ARE DIFFERENT FACTS, and only the second hides a failure.',
        example: 'agent-said',
      },
      {
        key: 'superseded', type: 'SupersededRun', required: false,
        description: 'THE LATER RUN THAT OVERTOOK THIS ONE, ON A RUN THAT HOLDS NO CHECK. Only POST /api/checks/<run>/superseded writes it, and only when the run has no theCheck; on a run that holds one it writes theCheck.superseded instead. It lives outside theCheck so a run whose check was never asked for, such as a run whose process ended before it said its work was finished, can be closed without inventing a check. Absent means the run was not closed this way.',
        example: { by: 'X-DaqTi6vb5U', at: '2026-09-28 10:00:00', byWhom: { kind: 'agent', id: 'secretary-1' }, because: 'The wave run that holds these commits was checked and merged.' },
      },
      {
        key: 'closedUnchecked', type: 'ClosedUnchecked', required: false,
        description: 'Who closed this run unchecked, when, why and the decision cited. Only POST /api/checks/<run>/closed-unchecked writes it. It stands closed unchecked and owes nothing; it supplies no merge verdict. It lives outside theCheck so a run with no recorded request can be closed without inventing one.',
        example: { by: { kind: 'agent', id: 'secretary-1' }, at: '2026-09-26 19:00:00', because: 'Nobody will run the check that was left waiting.', decision: '7vkbAVMCJufh' },
      },
      {
        key: 'released',
        type: 'Release',
        required: false,
        description:
          'WHO RELEASED THIS RUN, so that it is really over. When a worker says it has finished, that is not the ' +
          'end, and the agent above it is responsible for checking. A subagent saying it is done is a claim ' +
          'that the work is finished, not the finish. Two things may end it and one of them must happen: its ' +
          'starter checks it, or an inspector does. ABSENT ON A RUN THAT SAID IT WAS FINISHED MEANS NO CHECK ' +
          'HAPPENED, and the run reads as unreleased rather than as finished. Mole Office cannot stop a subagent ' +
          'process ending — that lifecycle belongs to the tool — so an unchecked finish is made visible here ' +
          'rather than prevented. Written only by POST /api/checks/<run>.' +
          ' An ordinary write may not set, change or drop it, and a run is not filed carrying it.',
        example: {
          by: { kind: 'agent', id: 'inspector-one' },
          at: '2026-09-07 03:14:00',
          how: 'an inspector',
          check: 'PdPb2neVO4jH',
        },
      },
      {
        key: 'refused',
        type: 'Refusal',
        required: false,
        description:
          'A CHECK REFUSED TO RELEASE THIS RUN, so the run entered rebuttal instead of ending. A group talks the ' +
          'refusal out; work with a real problem is redone, and work with none reports and ends. ' +
          'ABSENT MEANS NO CHECK HAS REFUSED THIS RUN, which is not the same as a check that passed it — that is ' +
          '`released` beside this. A refusal names what is missing and the group it is being talked out in, if one ' +
          'was opened. It stops standing when the run is released, when the worker says its work is finished again, ' +
          'or, on the merge queue\'s check again, when the office writes `endedWithItsMergeEntry` beside it. ' +
          'Written only by POST /api/checks/<run>, and by the office when the worker says its work is finished again.' +
          ' An ordinary write may not set, change or drop it, and a run is not filed carrying it.',
        example: {
          by: { kind: 'agent', id: 'inspector-one' },
          at: '2026-09-07 03:14:00',
          missing: ['The test for criterion 2 would pass with the feature deleted.'],
          chapter: 5,
          group: 'RJ03J5R5EhDe',
          check: 'PdPb2neVO4jH',
        },
      },
      {
        key: 'confirmed',
        type: 'Confirmation',
        required: false,
        description:
          'THE SUPERVISOR CONFIRMED THE REPORT, AND THAT IS WHAT CLOSES THIS RUN. A run that passes its check ' +
          'reports to its supervisor, and closes only once the report is confirmed. A release settles the ' +
          'check and does not end the run: the run reports to whoever started it, and stays live — worktree kept, ' +
          'nothing removed — until this is here. ABSENT ON A RELEASED RUN MEANS IT IS STILL REPORTING and ' +
          'somebody has to read what it did. Written only by POST /api/checks/<run>/confirm.' +
          ' An ordinary write may not set, change or drop it, and a run is not filed carrying it.',
        example: {
          by: { kind: 'agent', id: 'secretary-1' },
          at: '2026-09-07 06:02:00',
          because: 'Read the report and the pictures. The three criteria are met.',
        },
      },
      {
        key: 'endedWithItsMergeEntry',
        type: 'EndedWithItsMergeEntry',
        required: false,
        description:
          'THE OFFICE ENDED THIS CHECK-AGAIN RUN WITH ITS MERGE ENTRY, or an exact overdue hand-back take-back, so the run is closed although nobody confirmed ' +
          "it. The merge queue files a check-again run itself, and nobody " +
          'works in it, so a refusal of it would otherwise stand in rebuttal for ever. Written by the office in the ' +
          "same transaction as the entry's `refused` bounce. The refusal beside it stays as it was. ABSENT MEANS THE " +
          'OFFICE HAS NOT ENDED THIS RUN, which on a check-again run whose entry was withdrawn before the refusal is ' +
          'the lasting answer: no bounce happened, so no ending was written.',
        example: {
          entry: 'Cpmx8SPAnTEC',
          at: '2026-09-24 19:07:00',
          because: 'Ended with its merge entry, which its refusal bounced; nobody works in a check-again run.',
        },
      },
      {
        key: 'needsNoCheck',
        type: 'NeedsNoCheck',
        required: false,
        description:
          'THE OFFICE CLOSED THIS RUN WITHOUT A CHECK, so nothing waits on it. Exactly one of decision and rule names its authority. ' +
          "Written only by the office when it files a run for a secretary's design/-only entry, at a seal while its checks " +
          'are switched off, or at its start while its checks are switched off. ABSENT MEANS the office has not marked this run.',
        example: {
          decision: 'Madeup100007',
          at: '2026-09-25 00:59:00',
          because: "The office filed this run for the secretary's design/-only merge entry on secretary-notes, and such an entry needs no check.",
        },
      },
      {
        key: 'remindedBeforeTheSeal',
        type: 'RemindedBeforeTheSeal',
        required: false,
        description:
          'WHAT THE REMINDER BEFORE THE SEAL DID (wave 13j round 54): when it fired, the chapters it asked for, the items it ' +
          'named, and at the seal which of them the same checks still found; or that the run was sealed with no reminder, ' +
          'and why. Written only by the office. An ordinary write may not set, change or drop it. ABSENT MEANS NOBODY ' +
          'RECORDED IT: the run has not been reminded or sealed since this field existed.',
        example: { reminded: false, at: '2026-10-11 12:52:00', sealedTip: 'B4hLx2vw74Vs', because: 'theLauncherAskedForNone' },
      },
      {
        key: 'methodWork',
        type: 'MethodMark',
        required: false,
        description:
          'WHETHER THIS RUN IS METHOD WORK OR THE GO FOR A PILOT, said once by the person or by the agent that started the ' +
          "run's agent (part 6 of the design-first build). A marked run is reminded before its seal of the reviewed design " +
          'it lacks. Written only by POST /api/runs/<run>/method-work. ABSENT MEANS NOBODY MARKED IT, and the office never ' +
          "guesses it from the run's words.",
        example: { work: 'method-work', because: 'The run builds the grasp method the design chose.', by: { kind: 'agent', id: 'Ag1e2n3t4i5d' }, at: '2026-11-08 20:40:00' },
      },
      {
        key: 'howTheRoundEnded',
        type: 'HowTheRoundEnded',
        required: false,
        description: enWave14c['roundEnd.accountDescription'],
        example: { sealed: false, at: '2026-10-11 23:40:00', state: 'orphaned', reasons: [{ why: 'no-report', says: 'No report is linked about the run.' }], says: 'Run Gbr9Ovj2qgLK ended without a seal. No report is linked about the run.', whatToDo: 'File the report and link it about the run.', starterTold: 'M7lCouCY0Q8Y' },
      },
      {
        key: 'nextRound',
        type: 'NextRound',
        required: false,
        description:
          "THIS AGENT'S NEXT ROUND (wave 13j round loop-2), kept on its last run started in a sandbox: asked at " +
          'POST /api/agents/<agent>/next-round, then started by the message worker through `node tools/sandbox.mjs round`. ' +
          'Written only by the office. An ordinary write may not set, change or drop it. ABSENT MEANS NOBODY ASKED: no next ' +
          'round was asked for while this was the last run, or it was asked before this field existed.',
        example: { state: 'wanted', askedAt: '2026-10-12 14:00:00', askedBy: { who: { kind: 'agent', id: 'ooNSJY6rVzuI' }, as: 'its starter', session: 'aj8pUya9LRu7' }, brief: { path: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j/briefs/loop-3.md', sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', bytes: 2048 }, sandbox: { folder: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j', instance: 'w13j', container: 'cX2d9QwErT5y' } },
      },
      {
        key: 'workerRuns',
        type: 'Record<string, WorkerRun>',
        required: false,
        description:
          "THE WORKERS THIS RUN'S AGENT ASKED THE OFFICE TO START (wave 13j round loop-3), one entry for each worker by its " +
          'registry id: asked at POST /api/agents/<worker>/worker-run, then started by the message worker through ' +
          "`node tools/sandbox.mjs worker --parent <this run>`, so the worker's run is filed under this one. Written only by " +
          'the office. An ordinary write may not set, change or drop it. ABSENT MEANS NOBODY ASKED: this run asked for no ' +
          'worker, or asked before this field existed.',
        example: { Wk1e2r3t4y5u: { state: 'wanted', askedAt: '2026-10-12 19:00:00', askedBy: { who: { kind: 'agent', id: 'Sv1e2r3t4y5u' }, session: 'Rs1e2r3t4y5u' }, handle: 'a-worker', brief: { path: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j/briefs/a-worker.md', sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', bytes: 2048 }, sandbox: { folder: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j', instance: 'w13j', container: 'cX2d9QwErT5y' } } },
      },
      {
        key: FILING_HEAD,
        type: 'Record<string, string>',
        required: false,
        description:
          "THE COMMIT THIS RUN'S WORKING DIRECTORY WAS AT WHEN THE RUN WAS FILED (wave 13n): the commit, when the " +
          'office read it and the directory it read, or that it was not read and why. A seal counts as the run\'s own only ' +
          'the commits made after it. Written only by the office, as the run is filed. An ordinary write may not set, change ' +
          'or drop it. ABSENT MEANS A RUN FILED BEFORE THE OFFICE READ IT, or one that names no working directory: its seal ' +
          'counts its commits as before.',
        example: { commit: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b', at: '2026-11-22 10:00:00', directory: '/srv/mole-office-fixtures/worktrees/a-worker' },
      },
      {
        key: END_HEAD,
        type: 'Record<string, string>',
        required: false,
        description:
          "THE COMMIT THIS RUN'S WORKING DIRECTORY WAS AT WHEN THE RUN ENDED (wave 13n): read at the run's own " +
          'finish, at a write that ends its round, or by the account of a round that ended with no request, with when and ' +
          'where; or that it was not read and why, such as another run filed in the same directory first. Written only by ' +
          'the office. An ordinary write may not set, change or drop it. ABSENT MEANS NOT ENDED YET, or a run filed before ' +
          'the office read it.',
        example: { notRead: 'Another run was filed in /srv/mole-office-fixtures/worktrees/a-worker before this run\'s end was read.', at: '2026-11-22 11:00:00', directory: '/srv/mole-office-fixtures/worktrees/a-worker' },
      },
      {
        key: 'castingRoll',
        type: 'Record<string, unknown>',
        required: false,
        description:
          "HOW THE OFFICE CHOSE THIS RUN'S CASTING: a named model, a kept earlier roll, a new probability roll, the " +
          "marked row because no row had a probability above 0, or on a check only rows of the builder's model had one, " +
          'or no model, with its candidates, skipped rows and limit evidence. ' +
          'Written only by the office. An ordinary write may not set, change or drop it. Read strictly by readCastingRoll ' +
          'in shared/casting-roll.ts. ABSENT MEANS NOBODY RECORDED THE CHOICE: the run predates the router or did not use it.',
        example: { choice: 'none', group: 'hard', selected: null, candidates: [], skipped: [], keptFrom: null, unreadableStops: [], week: 'The sandboxes Claude week was not read.', notes: [], says: 'The Casting table has no row to take.' },
      },
      {
        key: 'cutAsked',
        type: 'CutAsked',
        required: false,
        description:
          "WHICH COMMIT THIS WORKER'S RUN WAS ASKED TO BE CUT FROM, AND WHETHER IT WAS (wave 13j, the round after loop-10): " +
          'the commit the ask at POST /api/agents/<worker>/worker-run chose, whether the launcher was given it to make the ' +
          "worktree at, and the commit the run was filed at. Written only by the office, when the run is filed for that ask. " +
          'An ordinary write may not set, change or drop it. ABSENT MEANS NOBODY ASKED: the run was not filed for a worker ' +
          'run a supervisor asked for, or was filed before this field existed.',
        example: { commit: '3f2a9c1e0000000000000000000000000000beef', named: null, used: true, stoodAt: '3f2a9c1e0000000000000000000000000000beef', says: "The worker's worktree /srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j/worktrees/a-worker was not there, so the launcher was given --cut-from 3f2a9c1e0000000000000000000000000000beef to make it at 3f2a9c1e0000000000000000000000000000beef, the commit run Rs1e2r3t4y5u's worktree stood at when it asked. The run was filed at 3f2a9c1e0000000000000000000000000000beef." },
      },
      {
        key: 'imagesGiven',
        type: 'ImagesGiven',
        required: false,
        description:
          "WHICH IMAGES THIS CODEX WORKER'S RUN WAS GIVEN AT ITS START (wave 13n round DM): the files of its worktree that the " +
          'ask at POST /api/agents/<worker>/worker-run named as images, which the launcher gave codex exec each as -i. ' +
          'Written only by the office, when the run is filed for that ask. An ordinary write may not set, change or drop it. ' +
          'ABSENT MEANS NO ASK NAMED AN IMAGE: the run was not filed for a worker run a supervisor asked for, its ask named ' +
          "none, or it was filed before this field existed. A run started by hand with the launcher's --image has none: the " +
          "launcher names its images in the run's launch details.",
        example: { images: ['design/the-page-now.png'], worktree: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j/worktrees/a-worker', says: "The launcher gave codex exec 1 image of the worker's worktree as -i: design/the-page-now.png." },
      },
      {
        key: 'workerPlace',
        type: 'Record<string, unknown>',
        required: false,
        description: "Where this worker's run works outside a sandbox, copied from its ask only by the office when the run is filed. An ordinary create or write may not set, change or drop it.",
        example: { kind: 'folder', folder: '/srv/fixture/work', repository: null },
      },
      {
        key: 'workerPackage',
        type: 'WorkerPackage',
        required: false,
        description:
          'THE PACKAGE THIS WORKER\'S RUN WAS STARTED FOR, with the points it works on, the difficulty and one sentence ' +
          'why: the session field `workerPackage`, in the shape TheWorkerPackage in shared/worker-runs.ts. Written only ' +
          'by the office, when the run is filed for an ask made at POST /api/agents/<agent>/worker-run. An ordinary write ' +
          'may not set, change or drop it. ABSENT MEANS NO PACKAGE WAS NAMED: the ask named none, the run was not filed ' +
          'for a worker ask, or it was filed before this field existed.',
        example: { task: 't8Kq2mW1pLzR', points: ['p1', 'p2'], difficulty: 'hard', why: 'These two points need the builder that wrote them.', askedAt: '2026-11-17 10:00:00' },
      },
      {
        key: 'commandEnded',
        type: 'CommandEnded',
        required: false,
        description:
          "HOW THE RUN'S COMMAND ENDED, written by the sandbox launcher when it ends: when, and its exit code or signal. Its " +
          'first appearance on a run with no seal is the moment the office records how the round ended. ABSENT MEANS THE ' +
          'LAUNCHER HAS NOT SAID: the command is still running, the run was not started by the launcher, or it ended before this field existed.',
        example: { at: '2026-10-11 23:40:00', code: 0 },
      },
      {
        key: 'stopCause',
        type: 'StopCause',
        required: false,
        description:
          'WHY THE RUN STOPPED, when it stopped for a cause the person must act on: a session limit, a quota or a login. ' +
          "Written by the session hook when a Claude Code run ends, by the office's sweep when a run went quiet with the " +
          "cause in its transcript, by the sandbox launcher when OpenCode Go's usage limit ends a run, and by the message " +
          "worker when a check's Claude Code result names the cause. Read by the sweep, which tells the person once for " +
          'each cause, and by the casting roll, which skips a limited model until its reset; neither reads a check, which ' +
          'has no closedBecause. On a check, a session limit holds new checks on the same login until its reset. ' +
          'ABSENT MEANS NO SUCH CAUSE WAS READ: the run is still going, it ended for another reason, or nobody ' +
          'read why it ended. A run filed before this was a field (wave 13s round 49) holds it at `extra.stopCause`, and ' +
          'the office still reads that copy.',
        example: { kind: 'session-limit', said: "You've hit your session limit · resets 7:10pm (Europe/London)", at: '2026-09-11T17:55:08.628+01:00', resetsAt: '7:10pm (Europe/London)' },
      },
      {
        key: 'waitingOnALimit',
        type: 'WaitOnALimit',
        required: false,
        description:
          "THE RUN IS WAITING ON OPENCODE GO'S USAGE LIMIT: OpenCode is retrying a call the limit refused, and will try " +
          'again at the reset. Written by the sandbox launcher at each retry, and taken off when OpenCode goes on or the ' +
          'command ends. Read by the casting roll, which skips every Go row until the reset. A next try more than an hour ' +
          "away is told once to the run's starter (tellTheStarter \"a-long-wait\"), and the lists that draw a run's state " +
          'draw the run as waiting on a usage limit until that try; the stored state stays running. ABSENT MEANS NO WAIT IS ' +
          'KNOWN: the run is not waiting, the launcher does not watch it, or it started before the launcher watched for ' +
          'one. A run filed before this was a field (wave 13s round 49) holds it at `extra.waitingOnALimit`, and the ' +
          'office still reads that copy.',
        example: { provider: 'opencode-go', said: 'Go usage limit reached. It will reset in 2 hours.', attempt: 1, seenAt: '2026-10-14T09:12:00.000+01:00', resetsAt: '2026-10-14T11:12:00.000+01:00', resetFrom: 'named by the error, as OpenCode\'s retry read it: "It will reset in 2 hours"', nextTryAt: '2026-10-14T11:12:00.000+01:00' },
      },
      {
        key: 'checkAlso',
        type: 'CheckAlso',
        required: false,
        description:
          "THE ITEMS THE RUN'S STARTER ASKED THE REMINDER BEFORE THE SEAL TO NAME. Given through PUT " +
          '/api/records/<run>/check-also, or as `data.checkAlso` (a list of sentences) when the run is filed; the record ' +
          "PATCH door refuses it, and so does the run's own key. The reminder names each one and never counts one as answered.",
        example: { items: ["Does the report answer the owner's question?"], by: { actorType: 'agent', actorId: 'coordinator' }, at: '2026-10-11 12:30:00' },
      },
      {
        key: 'integrated',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'THE INTEGRATION RECEIPT: THIS RUN\'S WORK IS IN THE MAIN WORLD. Sandbox v1 (SPEC.md section 5.4), written by ' +
          'the office when the merge entry submitted on this run\'s seal is merged: {entry, mainBefore, mainAfter, ' +
          'rebasedTip, sealId, carriedVerdict, reinspected, tests, ownerContent, placeholderCommits, at, time}, `time` being the clock observation beside `at`. ' +
          'ABSENT MEANS NOTHING THIS RUN SUBMITTED HAS ' +
          'LANDED, which is not the same as nothing having been submitted: the merge entry says where it has got to. ' +
          'Written by POST /api/merge-queue/<entry>/step and by nothing else. Inside it, `ownerContent` is the ' +
          'owner-content gate\'s reminders: what it named on the lines the entry adds to what ships and did not refuse it ' +
          'for. It is left out when no gate read the entry. `placeholderCommits` is each commit at the placeholder address ' +
          'the commit-address gate let land at remind, and is left out when it let none through.',
        example: { entry: 'entry-id', mainBefore: 'commit sha', mainAfter: 'commit sha', rebasedTip: 'commit sha', sealId: 'seal-id', carriedVerdict: { run: 'run-id', by: { kind: 'agent', id: 'inspector-one' }, at: '2026-09-22 09:00:00', how: 'an inspector', paths: 7, says: 'The release covered every path.' }, reinspected: [], ownerContent: { reminded: 0, byPattern: {}, log: '/path/to/the/merge/work/owner-content.json' }, at: '2026-09-22 10:00:00', time: { stamp: '2026-09-22 10:00:00', instant: '2026-09-22T10:00:00.000+01:00', offset: '+01:00', timeZone: 'Europe/London' } },
      },
      {
        key: 'atTheSeal',
        type: 'AtTheSeal',
        required: false,
        description:
          "WHAT THE OFFICE DID AT THIS RUN'S SEAL (wave 13u rounds 93 and 94, one field since round 96), in two parts: " +
          '`queued`, what it did with the seal for the merge queue, and `nextRound`, what it did about the next round. ' +
          'Written only by the office. An ordinary write may not set, change or drop it, or any part of it. ABSENT MEANS ' +
          "THE OFFICE DECIDED NOTHING AT THE SEAL: the run's agent has no line turned on, the seal held the round's check, " +
          'the office decided neither part, or the run was sealed before this field existed. Each part says what its own ' +
          'absence means. A run sealed by an earlier revision of the office may also hold a third part, `yeses`, which ' +
          'nothing reads or writes now.',
        example: { queued: { outcome: 'waits', for: 'an-earlier-entry', entry: 'entry-id', commit: '3f2a9c1e0000000000000000000000000000beef', at: '2026-10-25 17:30:00' } },
      },
      ...commonFields(
        'session',
        ' A run filed before wave 13s round 49 may hold `stopCause` and `waitingOnALimit` here, from before they were ' +
          'fields, and the office still reads those copies.',
      ),
    ],
    example: {
      state: 'crashed',
      runtime: 'claude-code',
      providerSession: '00000000-0000-0000-0000-000000000000',
      machine: 'desk-pc',
      workingDirectory: '/srv/mole-office-fixtures/projects/greenhouse',
      doing: 'was collating the force tables from the three v3 prints',
      detail: 'exit 137, out of memory',
      lastOutputAt: '2026-08-06 23:15:00',
      workspace: 'greenhouse',
    },
    rules: [
      '`workspace` is the last segment of `workingDirectory`. Write the whole path; Mole Office takes the short name from it.',
      'Closing an attachment writes `closedAt`, `closedBecause` and `closedHow` together. None of the three is written without the other two, and none of them stops a process.',
    ],
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const SESSION_SHAPES: Record<string, ShapeSpec> = {
  ClockStamp: {
    name: 'ClockStamp',
    description: 'One observed instant beside its local wall time. Legacy stamps alone cannot supply this evidence.',
    fields: [
      { key: 'stamp', type: 'date', required: true, description: 'Canonical local wall time.', example: '2026-10-25 01:30:00' },
      { key: 'instant', type: 'string', required: true, description: 'The instant with milliseconds and a numeric offset.', example: '2026-10-25T01:30:00.000+01:00' },
      { key: 'offset', type: 'string', required: true, description: 'Numeric offset east or west of UTC.', example: '+01:00' },
      { key: 'timeZone', type: 'string', required: true, description: 'The writer host timezone name.', example: 'Europe/London' },
    ],
  },

  // ------------------------------------------------------------------- what a run's runtime served
  //
  // HB1 of design/honour-board/ACCEPTANCE.md: a run's conditions are on its session record, written
  // by the runner and not by hand. Every field carries the LITERAL WORDS "not reported" when the
  // runtime gave nothing, because "a runner that wrote nothing" and "a runner that looked and saw
  // nothing" are different facts only when the words say so. The object is written once, at the
  // run's end, by the runner through the ordinary session door; a hand-written value comes only
  // from the person or the secretary, and the change log says who wrote it. An old session with no
  // `served` at all reads as "not recorded".
  Served: {
    name: 'Served',
    description:
      'WHAT THE RUNTIME SERVED ONE RUN: the model the provider\'s responses carried, the configured temperature, ' +
      'the brief\'s size in bytes and the context the provider reported. Written by the runner at the run\'s end; ' +
      'each field that the runtime gave nothing for holds the words "not reported". An old session without this ' +
      'object reads as "not recorded", which is a different fact from a field the runner looked for and could not report.',
    fields: [
      {
        key: 'model',
        type: 'string',
        required: true,
        description:
          'The model name the provider\'s responses actually carried — through dsh, the model field on the ' +
          'transcript\'s assistant messages. The words "not reported" when the transcript gave no model name. ' +
          'More than one name in one run is kept as the distinct names, separated by ", ", because one model name ' +
          'a run was served under is not a reason to drop the others.',
        example: 'deepseek-flash',
      },
      {
        key: 'temperature',
        type: `number | ${unionOf(['not reported'])}`,
        required: true,
        description:
          'The number the runtime was configured with, or the words "not reported" when neither the transcript nor ' +
          'the runner could say. Read off the transcript\'s request-context events when the provider reports one.',
        example: 1.3,
      },
      {
        key: 'briefBytes',
        type: `number | ${unionOf(['not reported'])}`,
        required: true,
        description:
          'The brief file\'s size in bytes, read by the runner from the brief path it was given. The words ' +
          '"not reported" when the path is unknown or the file is gone by the time the run ends.',
        example: 4207,
      },
      {
        key: 'contextTokens',
        type: 'ServedContextTokens',
        required: true,
        description: 'The context the provider reported for this run. See ServedContextTokens.',
        example: { largestTurn: 11163, total: 231801 },
      },
    ],
  },

  ServedContextTokens: {
    name: 'ServedContextTokens',
    description:
      'THE CONTEXT ONE RUN\'S PROVIDER REPORTED: the largest single turn\'s input and the total input across the ' +
      'run. Counted from the provider\'s own usage rows in the conversation transcript, and from nothing else — ' +
      'the per-chunk copies of the same numbers inside each message are the provider\'s transcript of its own ' +
      'streaming and are never counted, because counting them doubles the total.',
    fields: [
      {
        key: 'largestTurn',
        type: `number | ${unionOf(['not reported'])}`,
        required: true,
        description: 'The largest single turn\'s input token count the provider reported, or the words "not reported".',
        example: 11163,
      },
      {
        key: 'total',
        type: `number | ${unionOf(['not reported'])}`,
        required: true,
        description: 'The total input tokens across the whole run, or the words "not reported" when the provider carried none.',
        example: 231801,
      },
    ],
  },

  HonourBoardReading: {
    name: 'HonourBoardReading',
    description:
      'WHAT THE OFFICE READ ABOUT ONE RUN when it looked for the five honour signals: ' +
      'which of the five it earned and on which record ids, which it could not read and why, whether the run is ' +
      'exemplary or noted or none, and what the reading cost. Read by code from records only; no transcript, no log ' +
      'and no model is opened for it, and the reading is stored on the session record so the cost and the reading are ' +
      'said in one place.',
    fields: [
      { key: 'read_at', type: 'string', required: true, description: 'When this reading was made, in local wall clock. A later reading rewrites it.', example: '2026-09-16 12:00:00' },
      { key: 'standing', type: unionOf(['exemplary', 'noted', 'none']), required: true, description: 'Two or more signals is exemplary, one is noted, none is none. The threshold is the secretary\u2019s choice.', example: 'exemplary' },
      { key: 'threshold', type: 'number', required: true, description: 'How many signals the exemplary word costs. The secretary\u2019s choice, written here so the page can say it is theirs to change.', example: 2 },
      { key: 'signals', type: 'HonourSignalEntry[]', required: true, description: 'The signals the reading earned, each with the record ids that carry it.', example: [{ signal: 'found a real defect outside its brief', evidence: ['P1bld'], read_at: '2026-09-16 12:00:00' }] },
      { key: 'missing', type: 'HonourMissingEntry[]', required: true, description: 'The signals the office could not read, with the reason written in one sentence.', example: [{ signal: 'needed no rework', because: 'no check was asked for this run' }] },
      { key: 'cost', type: 'HonourCost', required: true, description: 'What the reading cost. See HonourCost.', example: { records: 214, ms: 38 } },
    ],
  },

  HonourSignalEntry: {
    name: 'HonourSignalEntry',
    description:
      'ONE SIGNAL THE OFFICE READ FROM RECORDS, with the ids of the records that say it. The five words are the ' +
      'acceptance\u2019s five words, and nothing else may stand in their place.',
    fields: [
      { key: 'signal', type: 'string', required: true, description: 'One of the five signal words, in the words the acceptance names: corrected its brief; found a real defect outside its brief; caught a blocking defect in review; needed no rework; proved every test by mutation.', example: 'found a real defect outside its brief' },
      { key: 'evidence', type: 'string[]', required: true, description: 'The record ids the office read this signal off. Removing one of these records removes the signal, which is what the mutation test proves.', example: ['jDwkhne4tDWR'] },
      { key: 'read_at', type: 'string', required: true, description: 'When this signal was read, in local wall clock.', example: '2026-09-16 12:00:00' },
    ],
  },

  HonourMissingEntry: {
    name: 'HonourMissingEntry',
    description:
      'ONE SIGNAL THE OFFICE COULD NOT READ, and why, in one sentence. An unearned signal is not silence: the ' +
      'reading says why, and "nobody recorded this" answers are ordinary ones here.',
    fields: [
      { key: 'signal', type: 'string', required: true, description: 'The same five words one of the earned signals names; this entry carries the one the reading could not earn.', example: 'needed no rework' },
      { key: 'because', type: 'string', required: true, description: 'Why it was not earned, in one sentence, naming the record absence or the fact that stands in the way.', example: 'no check was asked for this run' },
    ],
  },

  HonourCost: {
    name: 'HonourCost',
    description:
      'WHAT THE READING COST: how many records it touched and how many milliseconds the touch took. ' +
      'Number of records, never of rows beside them; and no transcript file, no log and no model was opened to make it.',
    fields: [
      { key: 'records', type: 'number', required: true, description: 'How many records the reading examined, including the rows its scans walked. A reading whose count and whose touches disagree is a defect.', example: 214 },
      { key: 'ms', type: 'number', required: true, description: 'How long the reading took, whole milliseconds from start to finish.', example: 38 },
    ],
  },

  Raise: {
    name: 'Raise',
    description:
      'ONE RAISE AS THE RUN IT WAS PRESSED IN RECORDS IT: since 26 September 2026 the start ' +
      'and the end of a raise are written on the secretary\'s run as well as on its agent record. It is a record of the grant, and ' +
      'grants nothing: whether an agent may act for the person is read from its registry row, which the agent record keeps.',
    fields: [
      {
        key: 'elevation',
        type: 'string',
        required: true,
        description: 'The id of the grant on the agent record, which every write made under it names.',
        example: 'elevation-20260926190000-a1b2',
      },
      { key: 'from', type: 'date', required: true, description: 'When they pressed it, in local wall clock.', example: '2026-09-26 19:00:00' },
      {
        key: 'until',
        type: 'string',
        required: false,
        description: 'What it ends at, as the grant says: a local wall-clock stamp, the id of a piece of work, or absent for "when you say".',
        example: '2026-09-27 19:00:00',
      },
      { key: 'reason', type: 'string', required: true, description: 'Why they raised it, in their words.', example: 'Delete the decision record filed by mistake' },
      { key: 'endedAt', type: 'date', required: false, description: 'When they ended it early, or absent.', example: '2026-09-26 19:20:00' },
      { key: 'endedBecause', type: 'string', required: false, description: 'What ended it, or absent.', example: 'You ended it.' },
    ],
  },

  /**
   * THE FAULTS A CHECK LISTED INSTEAD OF REFUSING, in the two places they are fixed (the
   * decisions of 9 November 2026). Code and proof go in the line's next round; a fault of form in a
   * record is patched in the office after the landing.
   */
  ListedFaults: {
    name: 'ListedFaults',
    description:
      'THE FAULTS A CHECK LISTED INSTEAD OF REFUSING. The release carries them so the line\'s next round can read ' +
      'them first and close the task the release files when they are patched.',
    fields: [
      {
        key: 'nextRound',
        type: 'string[]',
        required: true,
        description: 'The faults in code or proof that the line fixes in its own next round.',
        example: ['A test writes out a value the code defines.'],
      },
      {
        key: 'afterLanding',
        type: 'string[]',
        required: true,
        description: 'The faults of form in records, patched in the office after the landing.',
        example: ['A report has no short forms.'],
      },
    ],
  },

  /**
   * A RUN RELEASED: who ended it, when, and on what check. Criteria C17 and C19.
   *
   * One stored fact, and everything a screen says about a run is worked out from it. It is a shape
   * rather than a bag because "who released it" is the whole of the criterion: a release that names
   * nobody would read on every screen exactly like a release that named somebody.
   */
  Release: {
    name: 'Release',
    description:
      'THE RELEASE THAT ENDS A SUBAGENT\'S RUN. A subagent saying it is done does not end it: its starter or an ' +
      'inspector writes this, and until it is here the run reads as unreleased. Written by ' +
      'POST /api/checks/<run> and by a starter releasing its own agent.',
    fields: [
      {
        key: 'by',
        type: 'ParticipantRef',
        required: true,
        description: 'Who wrote the release. A release that names nobody is not a release.',
        example: { kind: 'agent', id: 'inspector-one' },
      },
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When, in local wall clock.',
        example: '2026-09-07 03:14:00',
      },
      {
        key: 'time',
        type: 'ClockStamp',
        required: false,
        description:
          'The clock observation beside `at`, read in the same moment. The local stamp repeats an hour when the clocks go back, ' +
          'so the merge queue counts a bus\'s wait from this. Absent on a release written before it was stored.',
        example: { stamp: '2026-10-25 01:10:00', instant: '2026-10-25T01:10:00.000+00:00', offset: '+00:00', timeZone: 'Europe/London' },
      },
      {
        key: 'how',
        type: unionOf(WHO_MAY_CHECK),
        required: true,
        description:
          'Which of the three ways ended it. Section 7.2 of design/rules/ACCEPTANCE.md: the starter checks it ' +
          'itself, or an inspector checks it. Doing neither is a break, and it is visible on the run. The third is ' +
          'a standard change: the run declared a standard kind at its seal, the files it changed are inside that ' +
          'kind and its own checks passed, so no inspector read it; `standard` then says which kind and why. The words ' +
          'are phrases rather than role names, because a role name is declared in src/config/roles.json ' +
          'and a stored value has to keep its meaning if a card is ever renamed.',
        example: 'an inspector',
      },
      {
        key: 'check',
        type: 'string',
        required: false,
        description:
          'The message that carried the check to the subagent, by record id. Absent where a starter released ' +
          'its own agent without writing one down.',
        example: 'PdPb2neVO4jH',
      },
      {
        key: 'read',
        type: 'WhatWasRead',
        required: false,
        description:
          'WHICH WORKTREE AND WHICH TIP THE CHECK BEHIND THIS RELEASE READ. A check reads a ' +
          "detached worktree of its own at the run's tip, never the worker's own tree. Absent means the check " +
          'did not say, which is what every release written before 7 September 2026 holds and is NOT the same ' +
          'as a check that read the right tree: a release made on a tree two processes were writing at once ' +
          'has to be recognisable as one a year later.',
        example: {
          worktree: '/srv/mole-office-fixtures/.cache/mole-office/worktrees/a-check-of-o2RjuOUEIwpf',
          tip: '83fababc40337490f1fd53fb26cd60a59080a261',
          ofItsOwn: true,
          says: 'This check read a detached worktree of its own and removed it when the verdict was written.',
        },
      },
      {
        key: 'wroteIntoTheOffice',
        type: 'WroteIntoTheOffice',
        required: false,
        description:
          'WHAT THE MODEL\'S RUN WROTE INTO THE OFFICE WHILE THE CHECK RAN, counted by the tool that started ' +
          'it. Acceptance finding 44, 23 September 2026: a check\'s model ran the tree\'s browser tests, the app ' +
          'read the live office\'s address from the model\'s environment, and 65 records were filed into the live ' +
          'office. ABSENT MEANS THE TOOL COULD NOT COUNT IT, which is not the same as a run that wrote nothing: ' +
          'a count of zero with no ids is a run that wrote nothing.',
        example: { count: 2, ids: ['O2RjuOUEIwpf', 'AWT42d6t8JTx'], from: '2026-09-23 00:08:00', to: '2026-09-23 00:10:00' },
      },
      {
        key: 'reportedTo',
        type: 'ParticipantRef',
        required: false,
        description:
          'WHO THIS RUN REPORTED TO WHEN IT WAS RELEASED. A released run reports to its supervisor ' +
          'and closes only when that supervisor confirms, so every screen drawing the run has to be able to name ' +
          'who is being waited for. ABSENT MEANS NOBODY WAS TOLD, which happens two ways and both are real: ' +
          "nothing is recorded as having started this run's agent, or the supervisor is the one who released it. " +
          'A run whose release names nobody has nobody to wait on, and the page says that rather than naming ' +
          'somebody plausible.',
        example: { kind: 'agent', id: 'secretary-1' },
      },
      {
        key: 'report',
        type: 'string',
        required: false,
        description:
          'The message carrying that report to the supervisor, by record id. Absent for the same two reasons ' +
          '`reportedTo` above is.',
        example: 'PdPb2neVO4jH',
      },
      {
        key: 'chaptersReadUnreadable',
        type: 'string[]',
        required: false,
        description:
          'THE CHAPTERS LINE THIS CHECK SENT COULD NOT BE READ, kept as text with why, so a ' +
          'finished check is not thrown away over one word. The verdict is written anyway, and this field says which ' +
          'part of the chapters line it rests on no evidence for. One entry per unreadable word: what it said and ' +
          'why it could not be read. Absent means every chapters word the check sent was read.',
        example: [
          '{"chapter":5,"level":"rules"} — "rules" is not a position on the reading ladder. The reading ladder has seven positions — label, title, gist, outline, sketch, digest and full.',
        ],
      },
      {
        key: 'judged',
        type: 'Record<string, unknown>[]',
        required: false,
        description:
          'A FILES SEAL ONLY: one line of the model\'s own for each path the files ' +
          'checker handed it to judge, `{path, concluded}`. The door refuses a release that leaves such a path ' +
          'without one, and the merge queue lands a handed-on file only on a release that names it here: a list ' +
          'the model was handed and repeated back would otherwise cover what nobody read. Absent means the check ' +
          'was handed nothing to judge.',
        example: [{ path: 'runs/console_1/RECOVERY.md', concluded: 'It rewrites the provenance note to say both recordings land in this round, which they do.' }],
      },
      tracedField,
      {
        key: 'listed',
        type: 'ListedFaults',
        required: false,
        description:
          'THE FAULTS THE CHECK LISTED INSTEAD OF REFUSING, in the two places they are fixed (decided on ' +
          '9 November 2026). `nextRound` is a fault in code or proof that the line fixes in its own next round; ' +
          '`afterLanding` is a fault of form in a record, patched in the office after the landing. The same words are in ' +
          '`check`, where the worker reads them; this key survives the release, and the door files one task for the ' +
          'line from it, held by the line\'s supervisor. Absent means the check listed nothing.',
        example: {
          nextRound: ['A test writes out a value the code defines.'],
          afterLanding: ['A report has no short forms.'],
        },
      },
      {
        key: 'standard',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'A STANDARD CHANGE ONLY, where `how` is the standard-change rule: `{kind, why, checks}`. `kind` is the ' +
          'standard kind the seal declared, one of one-plugin, words, tests and documents; `why` is the sentence ' +
          'saying how the changed files matched it; `checks` names each of its own checks that ran on the sealed ' +
          'tree, with its exit code. No inspector read the change. Absent on every other release.',
        example: { kind: 'documents', why: 'The one changed file is a document.', checks: [{ name: 'related-tests', code: 0 }] },
      },
    ],
  },

  /**
   * A RELEASED RUN'S CONTENT REACHED MAIN BY HAND, NOT THROUGH THE MERGE QUEUE, by point 12 of a
   * decision. Stored on the run's own `theCheck` and nowhere else, written only by
   * POST /api/checks/<run>/landed-by-hand, and it rewrites nothing of the run.
   */
  LandedByHand: {
    name: 'LandedByHand',
    description:
      'A RELEASED RUN\'S CONTENT REACHED MAIN BY HAND, NOT THROUGH THE MERGE QUEUE. The person, or a holder of the ' +
      'secretary card, records it through POST /api/checks/<run>/landed-by-hand, naming the commit. The office wrote it only ' +
      'after it found the run released and confirmed, no merge entry of it merged or still in the queue, the commit on the ' +
      'lane\'s main, and each of the run\'s commits in that commit by the proofs the superseded door uses.',
    fields: [
      { key: 'commit', type: 'string', required: true, description: 'The commit on main that holds the run\'s content, all 40 characters.', example: 'e4c1661aaabb83d46a5fe7dd7ff67ef640363191' },
      { key: 'lane', type: 'string', required: true, description: 'The lane\'s checkout whose main the commit is on.', example: '/srv/mole-office-fixtures/projects/mole-office' },
      { key: 'by', type: 'ParticipantRef', required: true, description: 'Who recorded it: the person or a holder of the secretary card.', example: { kind: 'agent', id: 'secretary-1' } },
      { key: 'at', type: 'date', required: true, description: 'When it was recorded, in local wall clock.', example: '2026-09-26 09:30:00' },
      { key: 'because', type: 'string', required: true, description: 'Why, in their own one sentence.', example: 'The queue could not land it, so the secretary landed it by hand at 04:52.' },
      {
        key: 'contains',
        type: 'SupersededContains',
        required: true,
        description: 'How git found the run\'s commits in `commit`: its sealed commit an ancestor, the same patches, or the same changed lines.',
        example: { how: 'ancestor', laterCommit: 'e4c1661aaabb83d46a5fe7dd7ff67ef640363191', commits: [{ commit: 'e4c1661aaabb83d46a5fe7dd7ff67ef640363191', as: 'e4c1661aaabb83d46a5fe7dd7ff67ef640363191' }] },
      },
    ],
  },

  ClosedUnchecked: {
    name: 'ClosedUnchecked',
    description: 'A run closed unchecked, by a secretary or the person proved by a key, through POST /api/checks/<run>/closed-unchecked. The office keeps it as an archive and nothing is owed.',
    fields: [
      { key: 'by', type: 'ParticipantRef', required: true, description: 'Who closed it.', example: { kind: 'agent', id: 'secretary-1' } },
      { key: 'at', type: 'date', required: true, description: 'When it was closed, in local wall clock.', example: '2026-09-26 19:00:00' },
      { key: 'because', type: 'string', required: true, description: 'Why the run was closed unchecked, in plain words.', example: 'The check was asked while the message worker was off and nobody will run it.' },
      { key: 'decision', type: 'string', required: false, description: 'The decision record cited for the closure. Absent means nobody named a decision.', example: '7vkbAVMCJufh' },
    ],
  },

  /**
   * A RUN CLOSED AS SUPERSEDED BY A LATER RUN: one on the same branch, or one that was checked and
   * merged and holds this run's commits. A decision of 16 September 2026, and a decision of
   * 25 September 2026.
   *
   * It is a shape rather than a bag because "which later run overtook it" is the whole of what the
   * mark proves: a superseded run that named no later run would read as one somebody closed for no
   * reason. It is stored on the run's own `theCheck` and nowhere else, and it rewrites nothing of
   * the run: the seal, the report and every refusal stay exactly as they were.
   */
  SupersededRun: {
    name: 'SupersededRun',
    description:
      'A RUN CLOSED AS SUPERSEDED BY A LATER RUN. The run\'s starter, or the owner, writes it through ' +
      'POST /api/checks/<run>/superseded. The later run was on the same branch and was released and confirmed; ' +
      'or it was on another branch, was released by an inspector, confirmed and merged, and git found each of ' +
      'this run\'s commits in it. It rewrites nothing else: the seal, the report and the refusals remain as they were.',
    fields: [
      {
        key: 'by',
        type: 'string',
        required: true,
        description: 'The later run that was released and confirmed, by record id.',
        example: 'X-DaqTi6vb5U',
      },
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When the starter closed it, in local wall clock.',
        example: '2026-09-16 15:02:00',
      },
      {
        key: 'byWhom',
        type: 'ParticipantRef',
        required: true,
        description: 'Who closed it: the run\'s starter or the owner. A superseded run that names nobody is not one.',
        example: { kind: 'agent', id: 'secretary-1' },
      },
      {
        key: 'because',
        type: 'string',
        required: true,
        description: 'Why, in the starter\'s own one sentence.',
        example: 'The later run on this branch finished the same work and its check released and confirmed it.',
      },
      {
        key: 'contains',
        type: 'SupersededContains',
        required: false,
        description:
          'HOW THE LATER RUN WAS FOUND TO HOLD THIS RUN\'S WORK. When git compared the ' +
          'commits (the later run was on another branch, or on the same branch closing a released run), `how` names ' +
          'the proof. When the later run was a later round of the same branch closing a run never released, `how` is ' +
          '`a later round of the same branch` and no commit was compared. Absent on a mark written before 26 ' +
          'September 2026, when that path wrote nothing here.',
        example: { how: 'same patches', laterCommit: '9f1c2d3e4b5a69788796a5b4c3d2e1f0a9b8c7d6', commits: [{ commit: '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d', as: '5e6f708192a3b4c5d6e7f8091a2b3c4d1a2b3c4d' }] },
      },
    ],
  },

  /**
   * HOW A LATER RUN ON ANOTHER BRANCH WAS PROVED TO HOLD A RUN'S
   * COMMITS (the answer `F4KyroEu2Pp3`). A worker's commits reach a wave by cherry-pick, so the
   * proof is either ancestry or the same patch-id, read in the seal's own repository.
   */
  SupersededContains: {
    name: 'SupersededContains',
    description:
      'HOW A LATER RUN WAS FOUND TO HOLD A RUN\'S WORK. `ancestor` means the run\'s sealed commit is in the ' +
      'history of the later run\'s sealed commit. `same patches` means each commit of the run, from its fork base ' +
      'to its sealed commit, has a commit with the same patch-id in the later run, from its fork base to its sealed ' +
      'commit. `same changed lines` means the same with patches made with no lines of context (-U0) for at least ' +
      'one commit: its own added and removed lines are unchanged, and the lines around them moved. ' +
      '`named by a released statement` means a commit none of those found is one a wave\'s statement ' +
      'names, covered by an inspector\'s release, with git agreeing with every other line of it. ' +
      '`a later round of the same branch` means no commit was compared: a later round of the same ' +
      'branch replaces an earlier round that was never released, and `commits` is empty. Read in the repository ' +
      'both seals name.',
    fields: [
      {
        key: 'how',
        type: "'ancestor' | 'same patches' | 'same changed lines' | 'named by a released statement' | 'a later round of the same branch'",
        required: true,
        description: 'Which proof held, tried in this order, or that none was asked because the later run was a later round of the same branch.',
        example: 'same patches',
      },
      {
        key: 'laterCommit',
        type: 'string',
        required: false,
        description: 'The later run\'s sealed commit, which the proof was read against. Left out only when the later run was a later round of the same branch and holds no git seal.',
        example: '9f1c2d3e4b5a69788796a5b4c3d2e1f0a9b8c7d6',
      },
      {
        key: 'readFromItsWorkingDirectory',
        type: 'SupersededWorkingDirectory',
        required: false,
        description:
          'WHERE THIS RUN\'S COMMITS WERE READ FROM WHEN IT HOLDS NO SEAL. A run that never said its ' +
          'work was finished was never sealed, so the door read its commits from its working directory, from the fork base ' +
          'to the commit named here, the way a seal would have read them. Absent means the commits came from the run\'s seal.',
        example: { directory: '/srv/mole-office-fixtures/.cache/mole-office/worktrees/code-3', forkBase: '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d', commit: '5e6f708192a3b4c5d6e7f8091a2b3c4d1a2b3c4d' },
      },
      {
        key: 'commits',
        type: 'SupersededCommit[]',
        required: true,
        description: 'Each commit of this run, oldest first, with the later commit that holds it.',
        example: [{ commit: '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d', as: '5e6f708192a3b4c5d6e7f8091a2b3c4d1a2b3c4d' }],
      },
      {
        key: 'statement',
        type: 'string',
        required: false,
        description:
          'THE STATEMENT THAT NAMED A CHANGED COMMIT, by record id, only when `how` is `named by a released statement`: a ' +
          'report holding one table with the statement\'s columns (src/shared/commit-statements.ts), covered by an ' +
          'inspector\'s release.',
        example: 'aUYFiA68BGIz',
      },
    ],
  },

  /** ONE COMMIT OF A SUPERSEDED RUN, AND THE LATER COMMIT THAT HOLDS IT. */
  SupersededCommit: {
    name: 'SupersededCommit',
    description:
      'ONE COMMIT OF A SUPERSEDED RUN AND THE COMMIT OF THE LATER RUN THAT HOLDS IT. On the ancestor proof the ' +
      'two are the same commit; on the same-patches proof the later one is the commit with the same patch-id.',
    fields: [
      {
        key: 'commit',
        type: 'string',
        required: true,
        description: 'The commit of this run, in full.',
        example: '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d',
      },
      {
        key: 'as',
        type: 'string',
        required: true,
        description: 'The commit of the later run that holds the same change, in full.',
        example: '5e6f708192a3b4c5d6e7f8091a2b3c4d1a2b3c4d',
      },
    ],
  },

  /** Where the superseded door read the commits of a run that holds no seal. Problem FuHKnNDBzrXW. */
  SupersededWorkingDirectory: {
    name: 'SupersededWorkingDirectory',
    description:
      'WHERE THE SUPERSEDED DOOR READ THE COMMITS OF A RUN THAT HOLDS NO SEAL: its working directory, from the fork base ' +
      'to the commit that was checked out there when the run was closed.',
    fields: [
      { key: 'directory', type: 'string', required: true, description: 'The run\'s working directory, as the run recorded it.', example: '/srv/mole-office-fixtures/.cache/mole-office/worktrees/code-3' },
      { key: 'forkBase', type: 'string', required: true, description: 'Where the run\'s commits start: the merge base of its commit and the branch it was cut from.', example: '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d' },
      { key: 'commit', type: 'string', required: true, description: 'The commit checked out in the working directory when the run was closed, in full.', example: '5e6f708192a3b4c5d6e7f8091a2b3c4d1a2b3c4d' },
    ],
  },

  /**
   * A CHECK REFUSED TO RELEASE A RUN, and the run did not end. Criterion C29.
   *
   * Stored on the run because it is a fact about the run. Until 7 September 2026 a refusal wrote two
   * messages and opened a group and left nothing on the run at all, so a person reading the run
   * could not tell one nobody had checked yet from one a check had turned down — both said "nobody
   * has released it, so no check happened", and the second half of that was false on the refused one.
   */
  Refusal: {
    name: 'Refusal',
    description:
      'A CHECK REFUSED TO RELEASE THIS RUN. A refused run goes into rebuttal and a group talks it out; work with ' +
      'a real problem is redone, and work with none reports and ends. The run does not end on a refusal: it enters ' +
      'rebuttal, the group named here is where it is talked out, and it leaves rebuttal one of two ways — the ' +
      'worker says its work is finished again, which writes `reworked` and sends it back to be checked, or ' +
      'somebody releases it, which writes `released` beside this. Written by POST /api/checks/<run>.',
    fields: [
      {
        key: 'by',
        type: 'ParticipantRef',
        required: true,
        description: 'Who refused it. A refusal that names nobody is not a refusal.',
        example: { kind: 'agent', id: 'inspector-one' },
      },
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When, in local wall clock.',
        example: '2026-09-07 03:14:00',
      },
      {
        key: 'missing',
        type: 'string[]',
        required: true,
        description:
          'What is missing, one line each. A refusal names what is missing, because a refusal ' +
          'that names nothing is an opinion rather than a refusal.',
        example: ['The test for criterion 2 would pass with the feature deleted.'],
      },
      {
        key: 'chapter',
        type: 'number',
        required: false,
        description:
          'The chapter of the office regulations this refusal rests on. Absent where it named none. At least one of ' +
          'chapter, precedent and invariant is always there: the door refuses a refusal naming none of them.',
        example: 5,
      },
      {
        key: 'precedent',
        type: 'string',
        required: false,
        description: 'The precedent record this refusal rests on, by id. Absent where it named none.',
        example: 'mbrqswzTCv3p',
      },
      {
        key: 'invariant',
        type: 'number',
        required: false,
        description:
          'The invariant of USER.md this refusal rests on, by the number USER.md gives it. Absent where it named ' +
          'none. The door takes only a number USER.md lists.',
        example: 5,
      },
      {
        key: 'group',
        type: 'string',
        required: false,
        description:
          'The group opened so the refusal can be talked out, by record id. A refusal opens a ' +
          'group holding the worker, its supervisor and the inspector, and the refusal stands while they talk. ' +
          'ABSENT BECAUSE NONE WAS OPENED, on a refusal of the merge queue\'s check again and on no other: nobody ' +
          'works in that run, so a talk about its refusal has nowhere to lead.',
        example: 'RJ03J5R5EhDe',
      },
      {
        key: 'check',
        type: 'string',
        required: false,
        description: 'The message that carried the refusal to the worker, by record id.',
        example: 'PdPb2neVO4jH',
      },
      {
        key: 'read',
        type: 'WhatWasRead',
        required: false,
        description:
          'WHICH WORKTREE AND WHICH TIP THE CHECK BEHIND THIS REFUSAL READ. Absent means the ' +
          'check did not say, which is not the same as a check that read the right tree.',
        example: {
          worktree: '/srv/mole-office-fixtures/.cache/mole-office/worktrees/a-check-of-o2RjuOUEIwpf',
          tip: '83fababc40337490f1fd53fb26cd60a59080a261',
          ofItsOwn: true,
          says: 'This check read a detached worktree of its own and removed it when the verdict was written.',
        },
      },
      {
        key: 'wroteIntoTheOffice',
        type: 'WroteIntoTheOffice',
        required: false,
        description:
          'WHAT THE MODEL\'S RUN WROTE INTO THE OFFICE WHILE THE CHECK RAN, counted by the tool that started ' +
          'it. Acceptance finding 44, 23 September 2026. ABSENT MEANS THE TOOL COULD NOT COUNT IT, which is not ' +
          'the same as a run that wrote nothing.',
        example: { count: 0, ids: [], from: '2026-09-23 00:08:00', to: '2026-09-23 00:10:00' },
      },
      {
        key: 'reworked',
        type: 'Reworked',
        required: false,
        description:
          'HOW THE REBUTTAL ENDED BY REWORK. Written by the office when the worker says its work is finished ' +
          'again after a refusal, which sends the run back to being checked. ABSENT MEANS THE REBUTTAL IS STILL ' +
          'OPEN, and that is exactly what a reader has to be able to see. The other way a rebuttal ends leaves ' +
          'nothing here: the group agrees nothing was wrong and somebody releases the run.',
        example: {
          at: '2026-09-07 05:20:00',
          because: 'The worker said its work was finished again after the refusal, so the office asked for a fresh check.',
        },
      },
      {
        key: 'chaptersReadUnreadable',
        type: 'string[]',
        required: false,
        description:
          'THE CHAPTERS LINE THIS CHECK SENT COULD NOT BE READ, kept as text with why, so a ' +
          'finished check is not thrown away over one word. The refusal is written anyway, and this field says which ' +
          'part of the chapters line it rests on no evidence for. One entry per unreadable word: what it said and ' +
          'why it could not be read. Absent means every chapters word the check sent was read.',
        example: [
          '{"chapter":5,"level":"rules"} — "rules" is not a position on the reading ladder. The reading ladder has seven positions — label, title, gist, outline, sketch, digest and full.',
        ],
      },
      tracedField,
    ],
  },

  /**
   * THE OFFICE ENDED A CHECK-AGAIN RUN WITH THE MERGE ENTRY ITS REFUSAL BOUNCED. Decision
   * yH7W1sXTRY5q, Q3 (a). Nobody works in such a run, so without this its refusal would leave it in
   * rebuttal for ever.
   */
  EndedWithItsMergeEntry: {
    name: 'EndedWithItsMergeEntry',
    description:
      'THE OFFICE ENDED THIS CHECK-AGAIN RUN WITH ITS MERGE ENTRY. Written by the office in the same transaction ' +
      "as the entry's `refused` bounce, on the run the merge queue filed for its check again, and on no other run.",
    fields: [
      {
        key: 'entry',
        type: 'string',
        required: true,
        description: 'The merge entry this run was the check again for, by record id.',
        example: 'Cpmx8SPAnTEC',
      },
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When, in local wall clock.',
        example: '2026-09-24 19:07:00',
      },
      {
        key: 'because',
        type: 'string',
        required: true,
        description: 'Why, in one sentence the office wrote.',
        example: 'Ended with its merge entry, which its refusal bounced; nobody works in a check-again run.',
      },
    ],
  },

  /**
   * THE OFFICE FILED THIS RUN FOR A SECRETARY'S design/-ONLY MERGE ENTRY, WHICH NEEDS NO CHECK. Decision 9sQNuC_N8MVX
   * and another decision. Without it the run would read as a finish nobody released, for ever.
   */
  NeedsNoCheck: {
    name: 'NeedsNoCheck',
    description:
      "THE OFFICE FILED THIS RUN UNDER A DECISION OR A STABLE RULE THAT ASKS NO CHECK OF IT. Written by " +
      'the office in the first write of the run it files for such an entry, and on no other run.',
    fields: [
      {
        key: 'decision',
        type: 'string',
        required: false,
        description: 'A nonempty decision reference. Exactly one of decision and rule is present.',
        example: undefined,
      },
      { key: 'rule', type: 'string', required: false, description: 'A known stable rule name. Exactly one of decision and rule is present.', example: 'a-take-back-returns-main-to-a-checked-state' },
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When, in local wall clock.',
        example: '2026-09-25 00:59:00',
      },
      {
        key: 'because',
        type: 'string',
        required: true,
        description: 'Why, in one sentence the office wrote.',
        example: "The office filed this run for the secretary's design/-only merge entry on secretary-notes, and such an entry needs no check.",
      },
    ],
  },

  /**
   * WHAT THE REMINDER BEFORE THE SEAL DID, KEPT ON THE RUN BY THE OFFICE. Wave 13j round 54; src/shared/before-the-seal.ts.
   */
  RemindedBeforeTheSeal: {
    name: 'RemindedBeforeTheSeal',
    description:
      'WHAT THE REMINDER BEFORE THE SEAL DID. Written only by the office: when the reminder fires, and again at the seal. ' +
      'With `reminded` true it holds when, the line that reminded, the chapters asked for and the items named, and after ' +
      'the seal `atTheSeal`. With `reminded` false the run was sealed with no reminder, and `because` says why.',
    fields: [
      { key: 'reminded', type: 'boolean', required: true, description: 'Whether the office reminded the run before this seal.', example: true },
      { key: 'at', type: 'date', required: true, description: 'When the reminder fired, or, with no reminder, when the seal was kept. Local wall clock.', example: '2026-10-11 12:40:00' },
      { key: 'afterSeal', type: 'string', required: false, description: "The run's sealedTip when it was reminded. Absent before its first seal.", example: 'B4hLx2vw74Vs' },
      { key: 'line', type: 'string', required: false, description: "The office's line to the run's agent that holds the reminder, by record id.", example: 'M7lCouCY0Q8Y' },
      { key: 'chapters', type: 'number[]', required: false, description: 'The chapters the reminder asked the report to list. Absent when the office reminded and did not keep what it named.', example: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      { key: 'items', type: 'BeforeTheSealItem[]', required: false, description: 'The items the reminder named. Absent when the office reminded and did not keep them.', example: [{ key: 'report:none', about: 'report', says: 'No report is linked to this run.' }] },
      { key: 'atTheSeal', type: 'BeforeTheSealAtTheSeal', required: false, description: 'What the same checks found at the seal. Absent until the run is sealed after this reminder.', example: { at: '2026-10-11 12:52:00', sealedTip: 'B4hLx2vw74Vs', stillFound: [], noLongerFound: ['report:none'], notJudged: [] } },
      { key: 'sealedTip', type: 'string', required: false, description: 'With `reminded` false: the seal that went ahead with no reminder.', example: 'B4hLx2vw74Vs' },
      {
        key: 'because',
        type: WHY_NOT_REMINDED.map((one) => `'${one}'`).join(' | '),
        required: false,
        description: 'With `reminded` false: why there was no reminder. `theGateIsOff` means the gate was off at the seal. `unknown` when the office cannot tell.',
        example: 'theLauncherAskedForNone',
      },
    ],
  },

  /**
   * HOW A SANDBOX ROUND ENDED, KEPT ON THE RUN BY THE OFFICE. Wave 13j round loop-1; src/shared/how-the-round-ended.ts.
   */
  HowTheRoundEnded: {
    name: 'HowTheRoundEnded',
    description:
      'HOW A ROUND STARTED IN A SANDBOX ENDED. Written only by the office, once. With `sealed` true: when, the seal, and ' +
      'whether the office asked for the check or held it because the run\'s last message to its starter did not say it ' +
      'seals. With `sealed` false: the run\'s state, the reasons the office found, what to do, and the line that told the ' +
      'starter, or why nobody was told.',
    fields: [
      { key: 'sealed', type: 'boolean', required: true, description: 'Whether the round ended sealed.', example: false },
      { key: 'at', type: 'date', required: true, description: 'When the office recorded it. Local wall clock.', example: '2026-10-11 23:40:00' },
      { key: 'says', type: 'string', required: true, description: "The office's sentence about the end.", example: 'Run Gbr9Ovj2qgLK ("Loop-1") ended without a seal. No report is linked about the run.' },
      { key: 'sealedTip', type: 'string', required: false, description: 'With `sealed` true: the seal.', example: 'B4hLx2vw74Vs' },
      { key: 'theCheck', type: "'asked' | 'held' | 'not asked'", required: false, description: 'With `sealed` true: whether the office asked for the check, held it, or asked none.', example: 'held' },
      { key: 'message', type: 'string', required: false, description: "With `sealed` true: the run's last message to its starter, which the hold read.", example: 'M7lCouCY0Q8Y' },
      { key: 'released', type: 'HowTheRoundEndedReleased', required: false, description: 'With the check held: who released it, when and why.', example: { by: 'coordinator', at: '2026-10-11 23:50:00', because: 'The question was answered.' } },
      { key: 'state', type: unionOf(SESSION_STATES), required: false, description: "With `sealed` false: the run's state when this was recorded, `unknown` when the run held no state word.", example: 'orphaned' },
      { key: 'reasons', type: 'HowTheRoundEndedReason[]', required: false, description: 'With `sealed` false: why there was no seal, in the order a starter acts on them.', example: [{ why: 'no-report', says: 'No report is linked about the run.' }] },
      { key: 'whatToDo', type: 'string', required: false, description: 'With `sealed` false: what the starter can do.', example: 'File the report and link it about the run.' },
      { key: 'starterTold', type: 'string', required: false, description: "With `sealed` false: the office's one line to the starter, by record id. Absent when nobody was told.", example: 'M7lCouCY0Q8Y' },
      { key: 'notTold', type: 'string', required: false, description: 'With `sealed` false and nobody told: why.', example: 'Nobody is recorded as having started this agent.' },
    ],
  },

  HowTheRoundEndedReason: {
    name: 'HowTheRoundEndedReason',
    description: 'ONE REASON A ROUND ENDED WITHOUT A SEAL: a fact the office read, never a guess about what the agent meant.',
    fields: [
      {
        key: 'why',
        type: "'the-process-died' | 'git-being-read' | 'no-commits' | 'commits-not-known' | 'no-report' | 'stopped-to-ask' | 'another-folder' | 'a-stale-base' | 'not-sealed'",
        required: true,
        description: 'Which reason.',
        example: 'no-report',
      },
      { key: 'says', type: 'string', required: true, description: 'The reason in a sentence.', example: 'No report is linked about the run.' },
      { key: 'names', type: 'string', required: false, description: 'The record it names: the message, or a report linked elsewhere.', example: 'M7lCouCY0Q8Y' },
    ],
  },

  HowTheRoundEndedReleased: {
    name: 'HowTheRoundEndedReleased',
    description: 'WHO RELEASED A HELD CHECK, WHEN AND WHY.',
    fields: [
      { key: 'by', type: 'string', required: true, description: 'Who released it.', example: 'coordinator' },
      { key: 'at', type: 'date', required: true, description: 'When. Local wall clock.', example: '2026-10-11 23:50:00' },
      { key: 'because', type: 'string', required: true, description: 'Why, in their words.', example: 'The question was answered.' },
    ],
  },

  /**
   * THE NEXT ROUND OF A SANDBOX RUN, ASKED AT ONE DOOR AND KEPT ON THE LAST RUN BY THE OFFICE. Wave 13j round loop-2;
   * src/shared/next-round.ts.
   */
  NextRound: {
    name: 'NextRound',
    description:
      'THE NEXT ROUND OF AN AGENT WHOSE LAST RUN WAS STARTED IN A SANDBOX, asked at POST /api/agents/<agent>/next-round ' +
      'and written only by the office. `wanted`: the ask is kept and nothing has started. `starting`: the message worker ' +
      'filed its launcher run and is starting `node tools/sandbox.mjs round`. `started`: the launcher filed the new run, ' +
      'derived from this one, and the office minted its key. `failed`: nothing was started, and `failed.says` says why.',
    fields: [
      { key: 'state', type: "'wanted' | 'starting' | 'started' | 'failed'", required: true, description: 'Where the ask is.', example: 'wanted' },
      { key: 'askedAt', type: 'date', required: true, description: 'When it was asked. Local wall clock.', example: '2026-10-12 14:00:00' },
      { key: 'askedBy', type: 'NextRoundAskedBy', required: true, description: 'Who asked, and as which of the six who may.', example: { who: { kind: 'agent', id: 'ooNSJY6rVzuI' }, as: 'its starter', session: 'aj8pUya9LRu7' } },
      { key: 'brief', type: 'NextRoundBrief', required: true, description: 'The brief, as a pointer and a hash.', example: { path: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j/briefs/loop-3.md', sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', bytes: 2048 } },
      { key: 'sandbox', type: 'NextRoundSandbox', required: true, description: 'The sandbox the last run was started in, as the office vouches for it.', example: { folder: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j', instance: 'w13j', container: 'cX2d9QwErT5y' } },
      { key: 'repair', type: 'NextRoundRepair', required: false, description: 'The merge entry this repair waits to land and the instant its launch reservation expires. The office writes entry and dueAt; ordinary rounds have none.', example: { entry: 'synthetic-entry', dueAt: '2026-10-12T19:05:00Z' } },
      { key: 'after', type: 'string', required: false, description: "The asker's own run, still going when it asked. The round starts after it ends.", example: 'aj8pUya9LRu7' },
      { key: 'replaced', type: 'NextRoundReplaced', required: false, description: 'The ask this one replaced, when one was still waiting.', example: { askedAt: '2026-10-12 13:50:00', askedBy: 'ooNSJY6rVzuI' } },
      { key: 'row', type: 'WorkerRunRow | null', required: false, description: "The Casting row of the agent's card in force when the round was asked for, as the ask read it, or null when none was in force. The start reads that row again by its id: a changed, held or removed row fails the start, and no other row is taken. Absent on an ask made before the ask kept its row.", example: { id: 3, revision: null, program: 'claude-code', model: 'claude-opus-5-5', effort: 'xhigh' } },
      { key: 'model', type: 'string', required: false, description: 'With `row` null: the model of the run the round continues, as the ask read it. The round keeps it.', example: 'claude-opus-5-5' },
      { key: 'waits', type: 'NextRoundWaits', required: false, description: 'While `wanted`: since when the ask waits for a process of this run that still runs, and which. Kept once the ask moves on.', example: { since: '2026-10-12 14:01:00', says: 'Run run-id has process row process-row-id, host pid 4242 group 4242, that still runs (pid 4242 is running). The launcher starts a round only once the run before it has ended.' } },
      { key: 'held', type: 'NextRoundHeld', required: false, description: 'Why a wanted round cannot start, when the hold began, and who recorded it.', example: { since: '2026-10-12 14:01:00', says: 'The agent has a run going.', by: 'the office' } },
      { key: 'starting', type: 'NextRoundStarting', required: false, description: 'From `starting` on: the launcher run, and the model and effort the office answered.', example: { at: '2026-10-12 14:05:00', wrapper: 'Wq1e2r3t4y5u', model: 'claude-opus-5-5', modelSays: 'The Casting row for builders.', effort: 'xhigh', effortFrom: "the owner's rule", effortSays: "The launcher asks the office for a builder run of nr-worker on claude-code with model claude-opus-5-5, and the office answers: The caller names model claude-opus-5-5. The run gets effort xhigh from the owner's rule. If the office cannot answer the launcher, the launcher uses the owner's rule and says so. Any effort the launcher passes is written on the run it starts." } },
      { key: 'started', type: 'NextRoundStarted', required: false, description: 'With `started`: the new run and the key the office minted for it, by id.', example: { at: '2026-10-12 14:05:10', run: 'Rn1e2r3t4y5u', runKeyId: 'Kh1e2r3t4y5u' } },
      { key: 'launcher', type: 'NextRoundLauncher', required: false, description: 'How the launcher ended, once it has.', example: { at: '2026-10-12 14:05:12', ok: true, says: 'The launcher exited with code 0.' } },
      { key: 'process', type: 'NextRoundProcess', required: false, description: "With `started`, once the launcher ended: the new run's open process row, or null with why none was found.", example: { row: 'Pr1e2r3t4y5u', says: 'Process row Pr1e2r3t4y5u of run Rn1e2r3t4y5u was open when the launcher ended.' } },
      { key: 'failed', type: 'NextRoundFailed', required: false, description: 'With `failed`: when, and why nothing was started.', example: { at: '2026-10-12 14:05:00', says: 'The brief changed after it was asked for.' } },
      { key: 'delegations', type: 'string[]', required: false, description: "With `line`, and only on an ask that named them: the inside packages the round takes, by task record id, in the ask's order. The office wrote the brief and its declaration for them.", example: ['Tk1e2r3t4y5u', 'Tk6y7u8i9o0p'] },
      { key: 'line', type: 'string', required: false, description: 'With `delegations`: the line the round takes them for.', example: '13n' },
    ],
  },

  NextRoundRepair: {
    name: 'NextRoundRepair',
    description: 'A repair reservation that waits for its merge entry to land on main before a fresh worktree can be cut.',
    fields: [
      { key: 'entry', type: 'string', required: true, description: 'The merge entry whose landed receipt supplies the minimum repair base.', example: 'synthetic-entry' },
      { key: 'dueAt', type: 'string', required: true, description: 'The instant, with its offset, when the launch reservation expires.', example: '2026-10-12T19:05:00Z' },
    ],
  },

  NextRoundAskedBy: {
    name: 'NextRoundAskedBy',
    description: 'WHO ASKED FOR A NEXT ROUND, proved by its own key, or the person.',
    fields: [
      { key: 'who', type: 'ParticipantRef', required: true, description: 'The agent by its registry id, or the person, named as a participant is named everywhere.', example: { kind: 'agent', id: 'ooNSJY6rVzuI' } },
      { key: 'as', type: "'the run’s agent' | 'its starter' | 'its leader' | 'a secretary' | 'the person' | 'the office'", required: true, description: 'Which of the six who may ask. The office asks only in its own process, for a fix round of a red merge entry, a resolve brief, or the next round of a run it saw sealed.', example: 'its starter' },
      { key: 'session', type: 'string', required: false, description: "The asker's run, when its key named one. Absent when it named none.", example: 'aj8pUya9LRu7' },
    ],
  },

  NextRoundBrief: {
    name: 'NextRoundBrief',
    description: 'A BRIEF, AS A POINTER AND A HASH. The file is read when it is asked for and again before the round starts.',
    fields: [
      { key: 'path', type: 'string', required: true, description: 'An absolute path inside the sandbox folder.', example: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j/briefs/loop-3.md' },
      { key: 'sha256', type: 'string', required: true, description: 'The sha256 of its bytes, in hex.', example: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' },
      { key: 'bytes', type: 'number', required: true, description: 'Its size.', example: 2048 },
    ],
  },

  NextRoundSandbox: {
    name: 'NextRoundSandbox',
    description: 'THE SANDBOX A NEXT ROUND RUNS IN: the folder, its instance name, and the ledger row of its container.',
    fields: [
      { key: 'folder', type: 'string', required: true, description: 'The sandbox folder, absolute.', example: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j' },
      { key: 'instance', type: 'string', required: true, description: 'The last part of the folder.', example: 'w13j' },
      { key: 'container', type: 'string', required: true, description: 'The ledger row of the container that names the folder.', example: 'cX2d9QwErT5y' },
    ],
  },

  NextRoundReplaced: {
    name: 'NextRoundReplaced',
    description: 'AN ASK A NEWER ONE REPLACED before anything started.',
    fields: [
      { key: 'askedAt', type: 'date', required: true, description: 'When the replaced ask was made.', example: '2026-10-12 13:50:00' },
      { key: 'askedBy', type: 'string', required: true, description: "The id of who made it: an agent's registry id, or the person's id.", example: 'ooNSJY6rVzuI' },
    ],
  },

  NextRoundStarting: {
    name: 'NextRoundStarting',
    description: 'THE START OF A NEXT ROUND: the worker\'s launcher run, the model the office answered, and the effort the office answers the launcher.',
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When. Local wall clock.', example: '2026-10-12 14:05:00' },
      { key: 'wrapper', type: 'string', required: true, description: "The message worker's run that starts the launcher. It runs no model.", example: 'Wq1e2r3t4y5u' },
      { key: 'worktree', type: 'string', required: false, description: 'The new directory reserved for this round: a repair, or a round after a git seal. It must not exist before the launcher makes it.', example: '/srv/mole-office-fixtures/worktrees/fresh-round' },
      { key: 'cutFrom', type: 'string', required: false, description: "The cutFrom the new run is filed with: for a repair, the verified current main commit; for a round after a git seal, the previous run's cutFrom, unchanged.", example: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { key: 'tip', type: 'string', required: false, description: "For a round after a git seal: the commit that seal holds, at which the launcher makes the new worktree. Absent for a repair, which starts at cutFrom.", example: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      { key: 'worktreeSays', type: 'string', required: false, description: "Why this round works in the previous run's directory: that run has no git seal. Absent when a new worktree is made.", example: 'Run Rn1e2r3t4y5u has no git seal, so this round works in its directory, /srv/mole-office-fixtures/worktrees/last-round.' },
      { key: 'model', type: 'string', required: true, description: 'The model the run-models door answered for a builder.', example: 'claude-opus-5-5' },
      { key: 'modelSays', type: 'string', required: true, description: 'Where that answer came from.', example: 'The Casting row for builders.' },
      { key: 'effort', type: 'string | null', required: false, description: "The effort the office answers the launcher's own question, a builder run of the agent on its runtime with this model. Null when the office answers none.", example: 'xhigh' },
      { key: 'effortFrom', type: 'string', required: true, description: "Where the office's effort came from: `the agent` (the agent's own model and effort), `Casting roll` (the row the agent's Casting roll chose, when it is not the marked row), `Casting` (the marked Casting row for the agent's card), `the owner's rule`, or `none`.", example: "the owner's rule" },
      { key: 'effortSays', type: 'string', required: true, description: 'The question the launcher asks, the office\'s answer in words, and what the launcher does when the office cannot answer it.', example: "The launcher asks the office for a builder run of nr-worker on claude-code with model claude-opus-5-5, and the office answers: The caller names model claude-opus-5-5. The run gets effort xhigh from the owner's rule. If the office cannot answer the launcher, the launcher uses the owner's rule and says so. Any effort the launcher passes is written on the run it starts." },
    ],
  },

  NextRoundStarted: {
    name: 'NextRoundStarted',
    description: 'A NEXT ROUND THAT STARTED: the new run, filed by the launcher, and the key the office minted for it.',
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When the run was filed. Local wall clock.', example: '2026-10-12 14:05:10' },
      { key: 'run', type: 'string', required: true, description: 'The new run, derived from this one.', example: 'Rn1e2r3t4y5u' },
      { key: 'runKeyId', type: 'string', required: true, description: 'The key the office minted for it, by id. Never the key.', example: 'Kh1e2r3t4y5u' },
    ],
  },

  NextRoundLauncher: {
    name: 'NextRoundLauncher',
    description: 'HOW THE LAUNCHER OF A NEXT ROUND ENDED, as the message worker read it.',
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When. Local wall clock.', example: '2026-10-12 14:05:12' },
      { key: 'ok', type: 'boolean', required: true, description: 'Whether it exited with code 0.', example: true },
      { key: 'says', type: 'string', required: true, description: 'How it ended, in a sentence.', example: 'The launcher exited with code 0.' },
    ],
  },

  NextRoundProcess: {
    name: 'NextRoundProcess',
    description: "THE NEW RUN'S PROCESS ROW, as the ledger held it when the launcher ended.",
    fields: [
      { key: 'row', type: 'string | null', required: false, description: 'The open process row, by id. Absent or null when none was open.', example: 'Pr1e2r3t4y5u' },
      { key: 'says', type: 'string', required: true, description: 'What was found, in a sentence.', example: 'Process row Pr1e2r3t4y5u of run Rn1e2r3t4y5u was open when the launcher ended.' },
    ],
  },

  NextRoundFailed: {
    name: 'NextRoundFailed',
    description: 'WHY A NEXT ROUND DID NOT START.',
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When. Local wall clock.', example: '2026-10-12 14:05:00' },
      { key: 'says', type: 'string', required: true, description: 'Why, in a sentence.', example: 'The brief changed after it was asked for.' },
    ],
  },

  NextRoundHeld: {
    name: 'NextRoundHeld',
    description: 'A reason a wanted next round cannot start. This hold has no deadline.',
    fields: [
      { key: 'since', type: 'date', required: true, description: 'When this reason was first recorded. Local wall clock.', example: '2026-10-12 14:01:00' },
      { key: 'says', type: 'string', required: true, description: 'Why the round is held.', example: 'The agent has a run going.' },
      { key: 'by', type: "'the office' | 'the message worker'", required: true, description: 'Which part of the office recorded the hold.', example: 'the office' },
    ],
  },

  NextRoundWaits: {
    name: 'NextRoundWaits',
    description:
      'A NEXT ROUND THAT WAITS FOR THE RUN BEFORE IT (wave 13u round 94). The message worker leaves the ask out of its list ' +
      "while a process of that run still runs, as the launcher would refuse it. After the office's limit the ask is failed.",
    fields: [
      { key: 'since', type: 'date', required: true, description: 'When the worker first found it waiting. Local wall clock.', example: '2026-10-12 14:01:00' },
      { key: 'says', type: 'string', required: true, description: 'Which process row it waits for, in a sentence.', example: 'Run run-id has process row process-row-id, host pid 4242 group 4242, that still runs (pid 4242 is running). The launcher starts a round only once the run before it has ended.' },
    ],
  },

  /**
   * ONE WORKER RUN A SUPERVISOR ASKED FOR, KEPT ON THE SUPERVISOR'S RUN BY THE OFFICE. Wave 13j round loop-3;
   * src/shared/worker-runs.ts. The parts it shares with a next round are the next round's shapes.
   */
  WorkerRun: {
    name: 'WorkerRun',
    description:
      'ONE WORKER RUN A SUPERVISOR ASKED FOR at POST /api/agents/<worker>/worker-run or /hand-run, written only by the office. A hand ask starts directly as starting with byHand:true, never wanted, and has no launcher wrapper. ' +
      '`wanted`: the ask is kept and nothing has started. `starting`: the message worker filed its launcher run and is ' +
      "starting `node tools/sandbox.mjs worker --parent <the supervisor's run>`, or `exec --agent` for a dsh or " +
      'OpenCode worker, chosen or rolled; a hand ask is already starting while its tool prepares the run. `started`: the launcher or hand tool filed the ' +
      "worker's run under the supervisor's run, and the office minted its key. `failed`: nothing was started, and " +
      '`failed.says` says why.',
    fields: [
      { key: 'state', type: "'wanted' | 'starting' | 'started' | 'failed'", required: true, description: 'Where the ask is.', example: 'wanted' },
      { key: 'byHand', type: 'boolean', required: false, description: 'True for a hand ask. It is kept directly as starting and the message worker does not launch it. Absent on a door ask.', example: true },
      { key: 'askedAt', type: 'date', required: true, description: 'When it was asked. Local wall clock.', example: '2026-10-12 19:00:00' },
      { key: 'askedBy', type: 'WorkerRunAskedBy', required: true, description: 'The supervisor, proved by its own key, and the run it asked from.', example: { who: { kind: 'agent', id: 'Sv1e2r3t4y5u' }, session: 'Rs1e2r3t4y5u' } },
      { key: 'handle', type: 'string', required: true, description: "The worker's handle when it was asked for.", example: 'a-worker' },
      { key: 'package', type: 'WorkerPackage', required: false, description: 'The package this ask named, with its points, its difficulty and why, in the shape TheWorkerPackage in shared/worker-runs.ts. The office copies it onto the worker\'s own run as `workerPackage` when the run is filed. Absent on an ask made before the package account, and on an ask that names none; the account draws both as naming none.', example: { task: 't8Kq2mW1pLzR', points: ['p1', 'p2'], difficulty: 'hard', why: 'These two points need the builder that wrote them.', askedAt: '2026-10-12 19:00:00' } },
      { key: 'brief', type: 'NextRoundBrief', required: true, description: 'The brief, as a pointer and a hash.', example: { path: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j/briefs/a-worker.md', sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', bytes: 2048 } },
      { key: 'sandbox', type: 'NextRoundSandbox', required: true, description: "The sandbox the supervisor's run was started in, as the office vouches for it. The worker starts in it too.", example: { folder: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j', instance: 'w13j', container: 'cX2d9QwErT5y' } },
      { key: 'replaced', type: 'WorkerRunReplaced', required: false, description: 'The ask this one replaced, when one was still waiting.', example: { askedAt: '2026-10-12 18:50:00' } },
      { key: 'chosen', type: 'WorkerRunChosen', required: false, description: 'The runtime and the model the ask chose, as named, and who chose them. A Casting row of the worker card in force for the project casts them. Absent when the ask named neither, and the Casting row for the worker card is given.', example: { runtime: 'codex', model: 'gpt-6.1-sol', by: { kind: 'agent', id: 'Sv1e2r3t4y5u' } } },
      { key: 'castingRoll', type: 'Record<string, unknown>', required: false, description: "How the default router chose the Casting row for the worker card at the ask, in the shape readCastingRoll in shared/casting-roll.ts reads (round 46). The start reads it and does not roll again. When the ask chose the program and the model, it is the roll an earlier ask on this entry made, kept unused for an ask that names neither (round 47), and absent when there was none. Absent on an ask made before round 46.", example: { choice: 'rolled', group: 'every row', selected: { rowId: 4, program: 'codex', model: 'gpt-6.1-sol', effort: 'low', probability: 0.5, share: 1, number: 0.3 }, candidates: [{ rowId: 4, program: 'codex', model: 'gpt-6.1-sol', effort: 'low', probability: 0.5, share: 1 }], skipped: [], keptFrom: null, unreadableStops: [], week: 'The sandboxes Claude week was not read.', notes: [], says: 'The every row Casting roll 0.3 chose row 4 (codex gpt-6.1-sol).' } },
      { key: 'row', type: 'WorkerRunRow', required: false, description: "The Casting row of the worker card the ask chose, by its choice or by its roll, as the ask read it. The start reads that row again, and a changed, held or removed row fails the start; no other row is taken or rolled. Absent on an ask made before the ask kept its row.", example: { id: 4, revision: null, program: 'codex', model: 'gpt-6.1-sol', effort: 'low' } },
      { key: 'cut', type: 'WorkerRunCut', required: false, description: "The commit the worker's worktree is to be cut from, as the ask chose it. Absent on an ask made before the ask chose one.", example: { commit: '3f2a9c1e0000000000000000000000000000beef', named: null } },
      { key: 'paths', type: 'string[]', required: false, description: 'The paths the ask named that the worker needs, which the start gives the launcher as `--with-path` each, so they are checked out in its worktree even when the sandbox\'s template leaves them out of a worker\'s. Absent when it named none.', example: ['design', 'docs/big'] },
      { key: 'images', type: 'string[]', required: false, description: "The files of the worker's worktree the ask named as images, which the start gives the launcher as `--image` each, so codex exec is given each as -i. Only a codex worker is given any. Absent when it named none.", example: ['design/the-page-now.png'] },
      { key: 'starting', type: 'WorkerRunStarting', required: false, description: "From `starting` on: the launcher run, and the program and the model it was given, from the ask's choice or the Casting row its roll chose.", example: { at: '2026-10-12 19:05:00', wrapper: 'Wq1e2r3t4y5u', runtime: 'claude-code', model: 'claude-opus-5-5', casting: 3, castingSays: 'The Casting row for worker in default.', effort: 'high', effortFrom: 'Casting', effortSays: "The launcher asks the office for a builder run of sw-hand on claude-code with model claude-opus-5-5, and the office answers: The caller names model claude-opus-5-5. The run gets effort high from the Casting row for worker. If the office cannot answer the launcher, the launcher uses the owner's rule and says so. Any effort the launcher passes is written on the run it starts." } },
      { key: 'started', type: 'NextRoundStarted', required: false, description: "With `started`: the worker's run and the key the office minted for it, by id.", example: { at: '2026-10-12 19:05:10', run: 'Rn1e2r3t4y5u', runKeyId: 'Kh1e2r3t4y5u' } },
      { key: 'launcher', type: 'NextRoundLauncher', required: false, description: 'How the launcher ended, once it has.', example: { at: '2026-10-12 19:05:12', ok: true, says: 'The launcher exited with code 0.' } },
      { key: 'process', type: 'NextRoundProcess', required: false, description: "With `started`, once the launcher ended: the worker's open process row, or null with why none was found.", example: { row: 'Pr1e2r3t4y5u', says: 'Process row Pr1e2r3t4y5u of run Rn1e2r3t4y5u was open when the launcher ended.' } },
      { key: 'failed', type: 'NextRoundFailed', required: false, description: 'With `failed`: when, and why nothing was started.', example: { at: '2026-10-12 19:05:00', says: 'The brief changed after it was asked for.' } },
    ],
  },

  WorkerRunAskedBy: {
    name: 'WorkerRunAskedBy',
    description: "THE SUPERVISOR THAT ASKED FOR A WORKER RUN, proved by its own key, and the run it asked from: the worker's registered starter.",
    fields: [
      { key: 'who', type: 'ParticipantRef', required: true, description: 'The supervisor, by its registry id.', example: { kind: 'agent', id: 'Sv1e2r3t4y5u' } },
      { key: 'session', type: 'string', required: true, description: "The supervisor's running run, named in x-mole-office-session at the worker-run door or askedBy for a hand start. The worker's run is filed under it.", example: 'aBcDeFgHiJkL' },
    ],
  },

  WorkerRunReplaced: {
    name: 'WorkerRunReplaced',
    description: 'A WORKER RUN ASK A NEWER ONE REPLACED before anything started. Only the supervisor asks, so who asked is not kept.',
    fields: [{ key: 'askedAt', type: 'date', required: true, description: 'When the replaced ask was made.', example: '2026-10-12 18:50:00' }],
  },

  WorkerRunChosen: {
    name: 'WorkerRunChosen',
    description: 'THE RUNTIME AND THE MODEL A SUPERVISOR CHOSE FOR ITS WORKER at the worker-run door, which a Casting row of the worker card casts, and who chose them.',
    fields: [
      { key: 'runtime', type: "'dsh' | 'codex' | 'claude-code' | 'opencode'", required: true, description: 'The runtime, as named.', example: 'codex' },
      { key: 'model', type: 'string', required: true, description: 'The model, as named. A Codex model is given to the launcher as openai/<model>. An OpenCode model keeps its provider.', example: 'gpt-6.1-sol' },
      { key: 'by', type: 'ParticipantRef', required: true, description: 'The supervisor that chose them, proved by its own key.', example: { kind: 'agent', id: 'Sv1e2r3t4y5u' } },
    ],
  },

  WorkerRunRow: {
    name: 'WorkerRunRow',
    description: "THE CASTING ROW A WORKER RUN ASK OR A NEXT ROUND'S ASK CHOSE, as the ask read it: its id, its selection revision, and the program, model and effort it cast. The start holds the row to these: a native row to its revision, and a row with no native data to its program, model and effort, and to having gained no native data.",
    fields: [
      { key: 'id', type: 'number', required: true, description: 'The Casting row, by its id.', example: 4 },
      { key: 'revision', type: 'string | null', required: true, description: "The row's selection revision when it has native selection data, or null for a row with none.", example: null },
      { key: 'program', type: "'dsh' | 'codex' | 'claude-code' | 'opencode'", required: true, description: "The row's program, one the launcher starts.", example: 'codex' },
      { key: 'model', type: 'string', required: true, description: "The row's model cell, as the ask read it.", example: 'gpt-6.1-sol' },
      { key: 'effort', type: 'string | null', required: true, description: "The row's effort cell as the ask read it, or null when it was empty.", example: 'low' },
    ],
  },

  WorkerRunCut: {
    name: 'WorkerRunCut',
    description:
      "THE COMMIT A WORKER'S WORKTREE IS TO BE CUT FROM, as the ask chose it: a branch or commit the ask named as cutFrom, " +
      "or else the commit the asking run's own worktree stood at when it asked. A branch or tag of the sandbox's " +
      'repository, or of the clone the ask named, reaches it, or the ask was refused. It is used only when the worktree is made at the start.',
    fields: [
      { key: 'commit', type: 'string', required: true, description: 'The commit, as git names it in full.', example: '3f2a9c1e0000000000000000000000000000beef' },
      { key: 'named', type: 'string | null', required: true, description: "The branch or commit the ask named as cutFrom, or null because it named none and the asking run's own commit was taken.", example: null },
      { key: 'clone', type: 'string', required: false, description: "The sandbox's clone beside repo/ the ask named, by the name <sandbox>/instance.json lists it under. The commit was looked for in it alone, and the launcher is given it as --clone. Absent when the ask named none, and the worktree is cut from repo/.", example: 'a-clone' },
    ],
  },

  WorkerRunStarting: {
    name: 'WorkerRunStarting',
    description: "THE START OF A WORKER RUN: a hand start keeps only its cut facts here, with no wrapper, model or effort from the launcher; a door start keeps the message worker's launcher run, the program and model it was given, from the ask's choice or from the Casting row the ask's roll chose for the worker card and how it chose, and the effort the office answers the launcher.",
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When. Local wall clock.', example: '2026-10-12 19:05:00' },
      { key: 'wrapper', type: 'string', required: false, description: "The message worker's run that starts the launcher. It runs no model. Absent for a hand start.", example: 'mNoPqRsTuVwX' },
      { key: 'runtime', type: 'string', required: false, description: "The program the launcher was given: the ask's choice, or the Casting row's.", example: 'claude-code' },
      { key: 'model', type: 'string', required: false, description: "The model the launcher was given: the ask's choice, a Codex model as openai/<model>, or the Casting row's.", example: 'claude-opus-5-5' },
      { key: 'casting', type: 'number', required: false, description: 'The Casting row, by its id. Absent when the ask chose the program and the model.', example: 3 },
      { key: 'castingSays', type: 'string', required: false, description: 'Where the Casting row\'s program and model came from, in a sentence. Absent when the ask chose them.', example: 'The Casting row for worker in default.' },
      { key: 'castingRoll', type: 'Record<string, unknown>', required: false, description: "How the default router chose the program and the model: the session field `castingRoll`, in the shape readCastingRoll in shared/casting-roll.ts reads, and copied onto the worker's run when the run is filed. Absent when the ask chose the program and the model, and on a start before round 44.", example: { choice: 'marked', group: 'every row', selected: { rowId: 3, program: 'claude-code', model: 'claude-opus-5-5', effort: 'high', probability: null, share: null, number: null }, candidates: [], skipped: [{ rowId: 3, program: 'claude-code', model: 'claude-opus-5-5', effort: 'high', probability: null, reasons: ['no probability is set'] }], keptFrom: null, unreadableStops: [], week: 'The sandboxes Claude week was not read.', notes: ['no probability is set'], says: 'The tools take marked row 3 because no probability is set for worker in every row.' } },
      { key: 'cutFrom', type: 'string | null', required: false, description: "The commit the launcher or hand tool was given as --cut-from to make the worker's worktree at, or null because an existing worktree is used as it stands or a direct filing records no worktree creation. Absent before the ask chose a cut.", example: '3f2a9c1e0000000000000000000000000000beef' },
      { key: 'cutSays', type: 'string', required: false, description: 'Whether the launcher or hand tool was given the cut, or the filing used an existing worktree, and why, in words. Absent before the ask chose a cut.', example: "The worker's worktree /srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j/worktrees/a-worker was not there, so the launcher was given --cut-from 3f2a9c1e0000000000000000000000000000beef to make it at 3f2a9c1e0000000000000000000000000000beef, the commit run aBcDeFgHiJkL's worktree stood at when it asked." },
      { key: 'effort', type: 'string | null', required: false, description: "The effort the office answers the launcher's own question, a builder run of the worker with this program and model. The rolled or marked Casting row's effort only when the row casts one. Null when the office answers none.", example: 'high' },
      { key: 'effortFrom', type: 'string', required: false, description: "Where the office's effort came from: `the agent` (the agent's own model and effort), `Casting roll` (the row the agent's Casting roll chose, when it is not the marked row), `Casting` (the marked Casting row for the agent's card), `the owner's rule`, or `none`.", example: 'Casting' },
      { key: 'effortSays', type: 'string', required: false, description: 'The question the launcher asks, the office\'s answer in words, and what the launcher does when the office cannot answer it.', example: "The launcher asks the office for a builder run of sw-hand on claude-code with model claude-opus-5-5, and the office answers: The caller names model claude-opus-5-5. The run gets effort high from the Casting row for worker. If the office cannot answer the launcher, the launcher uses the owner's rule and says so. Any effort the launcher passes is written on the run it starts." },
    ],
  },

  CutAsked: {
    name: 'CutAsked',
    description:
      "WHICH COMMIT A WORKER'S RUN WAS ASKED TO BE CUT FROM, AND WHETHER IT WAS, kept on the worker's run by the office " +
      'when the run is filed: the session field `cutAsked`, in the shape TheCutAsked in shared/worker-runs.ts.',
    fields: [
      { key: 'commit', type: 'string', required: true, description: 'The commit the ask chose, as git names it in full.', example: '3f2a9c1e0000000000000000000000000000beef' },
      { key: 'named', type: 'string | null', required: true, description: "The branch or commit the ask named as cutFrom, or null because it named none and the asking run's own commit was taken.", example: null },
      { key: 'used', type: 'boolean', required: true, description: "Whether the launcher or hand tool was given the commit to make the worktree at: false when an existing worktree was used as it stood, or a direct filing recorded no worktree creation.", example: true },
      { key: 'stoodAt', type: 'string | null', required: true, description: 'The commit the run was filed at, which the launcher read from its worktree, or null when the run names none.', example: '3f2a9c1e0000000000000000000000000000beef' },
      { key: 'says', type: 'string', required: true, description: 'The same, in words.', example: 'The run was filed at 3f2a9c1e0000000000000000000000000000beef.' },
    ],
  },

  WorkerPackage: {
    name: 'WorkerPackage',
    description:
      "THE PACKAGE A WORKER START NAMED, kept on the worker's own run by the office when the run is filed: the session " +
      'field `workerPackage`, in the shape TheWorkerPackage in shared/worker-runs.ts. The points are the package\'s own ' +
      'points the worker was given, and `why` is one sentence saying why this worker was given them.',
    fields: [
      { key: 'task', type: 'string', required: true, description: 'The packaged task this worker was given. Its title is read live from the task and never stored here.', example: 't8Kq2mW1pLzR' },
      { key: 'points', type: 'string[]', required: true, description: 'The package\'s points the ask named, in the order it named them.', example: ['p1', 'p2'] },
      { key: 'difficulty', type: 'string', required: true, description: 'The Casting label the ask named, or the one its brief marked.', example: 'hard' },
      { key: 'why', type: 'string', required: true, description: 'One sentence saying why this worker was given these points.', example: 'These two points need the builder that wrote them.' },
      { key: 'askedAt', type: 'date', required: true, description: 'When the ask was made, local wall clock. A day\'s read finds the package by this moment, not by when the worker\'s run was filed.', example: '2026-11-17 10:00:00' },
    ],
  },

  ImagesGiven: {
    name: 'ImagesGiven',
    description:
      "WHICH IMAGES A CODEX WORKER'S RUN WAS GIVEN AT ITS START, kept on the worker's run by the office when the run is " +
      'filed: the session field `imagesGiven`, in the shape TheImagesGiven in shared/worker-runs.ts.',
    fields: [
      { key: 'images', type: 'string[]', required: true, description: "The paths in the worker's worktree, in the order the ask named them. The launcher gave codex exec each one as -i.", example: ['design/the-page-now.png'] },
      { key: 'worktree', type: 'string', required: true, description: "The worker's worktree, the folder each path is in.", example: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j/worktrees/a-worker' },
      { key: 'says', type: 'string', required: true, description: 'The same, in words.', example: "The launcher gave codex exec 1 image of the worker's worktree as -i: design/the-page-now.png." },
    ],
  },

  CommandEnded: {
    name: 'CommandEnded',
    description: "HOW A SANDBOX RUN'S COMMAND ENDED, as the launcher read it. Written once by the launcher when the command ends.",
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When. Local wall clock.', example: '2026-10-11 23:40:00' },
      { key: 'code', type: 'number', required: false, description: 'The exit code, when it exited.', example: 0 },
      { key: 'signal', type: 'string', required: false, description: 'The signal that ended it, when one did.', example: 'SIGKILL' },
    ],
  },

  StopCause: {
    name: 'StopCause',
    description: "WHY A RUN STOPPED, for a cause the person must act on, as the session hook, the office's sweep or the sandbox launcher read it.",
    fields: [
      { key: 'kind', type: "'session-limit' | 'quota' | 'login'", required: true, description: "Which cause: a session limit, a quota, or a login. OpenCode Go's usage limit is a quota.", example: 'session-limit' },
      { key: 'said', type: 'string', required: true, description: "The cause's own words, as the transcript or the provider's error gave them.", example: "You've hit your session limit · resets 7:10pm (Europe/London)" },
      { key: 'at', type: 'string | null', required: false, description: "When the cause was said: an instant in local wall-clock with its offset, in the shape clockStamp in src/shared/time.ts writes. Read from the transcript line's own time, or stamped when the cause was read from a launcher's or a check's output. Absent or null when the line carried no time, or words that name no moment.", example: '2026-09-11T17:55:08.628+01:00' },
      { key: 'resetsAt', type: 'string | null', required: false, description: "When the limit resets: the time the cause's words named, or the instant the launcher worked out for a Go stop. Absent or null when nothing named one.", example: '7:10pm (Europe/London)' },
      { key: 'resetFrom', type: 'string', required: false, description: 'Where the reset came from, in words: named by the error, or assumed and why. The launcher writes it for an OpenCode Go stop. A cause read from a transcript has none.', example: 'named by the error: "retry-after: 7200"' },
    ],
  },

  WaitOnALimit: {
    name: 'WaitOnALimit',
    description: "A RUN'S WAIT ON OPENCODE GO'S USAGE LIMIT, as the sandbox launcher read it from OpenCode's retry.",
    fields: [
      { key: 'provider', type: 'string | null', required: false, description: 'The provider OpenCode named for the retry. Absent or null when it named none.', example: 'opencode-go' },
      { key: 'said', type: 'string', required: true, description: "The retry's own words.", example: 'Go usage limit reached. It will reset in 2 hours.' },
      { key: 'attempt', type: 'number | null', required: false, description: "Which try this is, as OpenCode counts them. Absent or null when the retry did not say.", example: 1 },
      { key: 'seenAt', type: 'string', required: true, description: 'When the launcher read the retry, as an instant.', example: '2026-10-14T09:12:00.000+01:00' },
      { key: 'resetsAt', type: 'string', required: true, description: "When the limit resets, as an instant: the time the retry named, or five hours from the retry when it named none. `resetFrom` says which. OpenCode's next try is `nextTryAt`.", example: '2026-10-14T11:12:00.000+01:00' },
      { key: 'resetFrom', type: 'string', required: true, description: 'Where the reset came from, in words: named by the error, or assumed and why.', example: 'named by the error, as OpenCode\'s retry read it: "It will reset in 2 hours"' },
      { key: 'nextTryAt', type: 'string', required: false, description: "When OpenCode said it will try again, as an instant, from the retry's own next try. The lists draw a running run whose next try is more than an hour after `seenAt` as waiting on a usage limit until then (src/config/a-long-wait.mjs). Absent when the retry gave none, and on a mark written before the launcher kept it: such a run is drawn as running.", example: '2026-10-14T11:12:00.000+01:00' },
      { key: 'key', type: "'the-router' | 'OPENCODE_API_KEY' | 'opencode-login'", required: false, description: "The key the run waits on, by its name and never its value: the provider router's Go slots, the key in OPENCODE_API_KEY, or OpenCode's own login. Absent on a mark written before the launcher named it.", example: 'opencode-login' },
    ],
  },

  BeforeTheSealItem: {
    name: 'BeforeTheSealItem',
    description: 'ONE ITEM THE REMINDER BEFORE THE SEAL NAMED. `key` says which check found it and of what, so the seal can look for the same one.',
    fields: [
      { key: 'key', type: 'string', required: true, description: 'Which check found it, and of what: for example report:none, test:<path>, check-also:<n>.', example: 'report:none' },
      { key: 'about', type: unionOf(WHAT_IT_IS_ABOUT), required: true, description: 'What kind of thing it is about.', example: 'report' },
      { key: 'says', type: 'string', required: true, description: 'What the reminder said, in words the run can act on.', example: 'No report is linked to this run.' },
      { key: 'mechanical', type: 'boolean', required: false, description: 'True when the branch and the records alone decide it: certain. False for a test proof and a starter\'s item. Absent on an item kept before wave 13j round 56.', example: true },
    ],
  },

  BeforeTheSealAtTheSeal: {
    name: 'BeforeTheSealAtTheSeal',
    description:
      'WHAT THE SAME CHECKS FOUND AT THE SEAL, by item key. A check-also item is never judged. When nothing could be ' +
      'compared, `stillFound` and `noLongerFound` are absent and `couldNotJudge` says why.',
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When the seal was kept. Local wall clock.', example: '2026-10-11 12:52:00' },
      { key: 'sealedTip', type: 'string', required: true, description: 'The seal this is about.', example: 'B4hLx2vw74Vs' },
      { key: 'stillFound', type: 'string[]', required: false, description: 'Items the same checks found again.', example: ['test:tests/a.test.ts'] },
      { key: 'noLongerFound', type: 'string[]', required: false, description: 'Items the same checks did not find.', example: ['report:none'] },
      { key: 'notJudged', type: 'string[]', required: true, description: 'Items the office cannot judge.', example: ['check-also:0'] },
      { key: 'couldNotJudge', type: 'string', required: false, description: 'Why nothing could be compared, when that is so.', example: 'The office did not keep what the reminder named.' },
      { key: 'machineWideScans', type: 'BeforeTheSealScanDecided[]', required: false, description: 'What the seal recorded of each machine-wide test line the reminder named. Absent when the seal could not read the lines the run adds under tests/.', example: [{ key: 'machine-wide:tests/a.test.ts:tmp:readdirSync(tmpdir())', decision: 'not decided' }] },
    ],
  },

  BeforeTheSealScanDecided: {
    name: 'BeforeTheSealScanDecided',
    description:
      'WHAT THE SEAL RECORDED OF ONE TEST LINE THAT READS THE WHOLE MACHINE, named by the reminder before the seal. None ' +
      'of the three decisions refuses the seal.',
    fields: [
      { key: 'key', type: 'string', required: true, description: "The item's key, as the reminder named it.", example: 'machine-wide:tests/a.test.ts:tmp:readdirSync(tmpdir())' },
      { key: 'decision', type: "'no longer found' | 'kept' | 'not decided'", required: true, description: 'No longer found: the same finder does not find the line at the seal. Kept: the line is marked "machine-wide on purpose:" with a reason. Not decided: found, with no reason.', example: 'kept' },
      { key: 'reason', type: 'string', required: false, description: 'The reason written on the line. With `kept` only.', example: 'it shows that the folder is shared' },
    ],
  },

  CheckAlso: {
    name: 'CheckAlso',
    description:
      "THE ITEMS A RUN'S STARTER ASKED THE REMINDER BEFORE THE SEAL TO NAME. Written by PUT /api/records/<run>/check-also, " +
      'or with the run when it is filed, and never by the run\'s own key.',
    fields: [
      { key: 'items', type: 'string[]', required: true, description: 'At most 20 sentences of at most 300 characters each.', example: ["Does the report answer the owner's question?"] },
      { key: 'by', type: 'CheckAlsoGivenBy', required: true, description: 'Who gave them.', example: { actorType: 'agent', actorId: 'coordinator' } },
      { key: 'at', type: 'date', required: true, description: 'When. Local wall clock.', example: '2026-10-11 12:30:00' },
    ],
  },

  CheckAlsoGivenBy: {
    name: 'CheckAlsoGivenBy',
    description: 'WHO GAVE A RUN ITS CHECK-ALSO ITEMS: the actor of the request, as the office saw it.',
    fields: [
      { key: 'actorType', type: "'human' | 'agent' | 'system'", required: true, description: 'Which kind of writer, as BundleExporter names one.', example: 'agent' },
      { key: 'actorId', type: 'string', required: true, description: 'Their id as the request named it.', example: 'coordinator' },
    ],
  },

  Reworked: {
    name: 'Reworked',
    description:
      'THE WORKER ANSWERED A REFUSAL BY DOING THE WORK AGAIN. Written by the office at the moment the run says ' +
      'its work is finished for a second time, which is the act that takes it out of rebuttal.',
    fields: [
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When, in local wall clock.',
        example: '2026-09-07 05:20:00',
      },
      {
        key: 'because',
        type: 'string',
        required: true,
        description: 'What the office says happened, in one plain sentence.',
        example: 'The worker said its work was finished again after the refusal, so the office asked for a fresh check.',
      },
    ],
  },

  /**
   * THE SUPERVISOR CONFIRMED THE REPORT, so the run is over. Criterion C29.
   *
   * A release ends the check. It does not end the run. This does, and it is the only thing that
   * does: a run reports to its supervisor, and closes only once the report is confirmed correct.
   */
  Confirmation: {
    name: 'Confirmation',
    description:
      'THE SUPERVISOR CONFIRMED THE REPORT, AND THAT IS WHAT CLOSES A RUN. A run that passes its check reports ' +
      'to its supervisor, and closes only once the report is confirmed. A release settles the ' +
      'CHECK; the run then reports to whoever started it, and stays a live run — its worktree kept, nothing ' +
      'removed — until this is written. Written by POST /api/checks/<run>/confirm, which is the press on the ' +
      "run's page.",
    fields: [
      {
        key: 'by',
        type: 'ParticipantRef',
        required: true,
        description:
          'Who confirmed it. The supervisor the run reported to, or the person. Anybody else is refused, unless ' +
          'the release recorded no supervisor at all — a run with nobody to wait on would otherwise stay open ' +
          'for ever, and the reply then says out loud that whoever closed it was not its supervisor.',
        example: { kind: 'agent', id: 'secretary-1' },
      },
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When, in local wall clock.',
        example: '2026-09-07 06:02:00',
      },
      {
        key: 'because',
        type: 'string',
        required: true,
        description:
          'What they said when they confirmed it. Required, because a close with nothing behind it is ' +
          'indistinguishable from a mis-press a year later.',
        example: 'Read the report and the pictures. The three criteria are met.',
      },
      {
        key: 'read',
        type: 'WhatWasRead',
        required: false,
        description:
          'WHICH SEAL, WHICH TREE AND WHICH TIP THIS CONFIRMATION ACCEPTED. Only on a confirmation made with no ' +
          'release, which happens at the review levels `none` and `light` where the office starts no inspector. ' +
          'At `full` the release carries these and this is absent. A CONFIRMATION ' +
          'THAT NAMES A SEAL IS NOT A CHECK: what it proves is which work was accepted, never that anybody read ' +
          'that work against the office regulations, and `ofItsOwn` is false because a confirmation reads no worktree. ' +
          'Absent also where no seal named a tree — a records-only seal, or a run that finished before seals.',
        example: {
          sealId: 'PdPb2neVO4jH',
          sealHash: '83fababc40337490f1fd53fb26cd60a59080a26183fababc40337490f1fd53fb',
          worktree: '/srv/mole-office-fixtures/.cache/mole-office/worktrees/a-w3-check-chain',
          tip: '83fababc40337490f1fd53fb26cd60a59080a261',
          ofItsOwn: false,
          says: 'No inspector was started, so the seal, its hash and the tip are named here instead.',
        },
      },
    ],
  },

  StartStepReading: {
    name: 'StartStepReading',
    description:
      'ONE STEP OF A START, AS THE OFFICE MEASURED IT FROM ITS OWN CALL LOG. The steps are declared once in ' +
      'src/shared/start-cost.ts. An absent key is a part of the step nobody measured — "no request of this kind" — ' +
      'and is never a stored zero. Tool rounds are no longer counted; what a start records is which step ' +
      'cost which tokens and time.',
    fields: [
      { key: 'name', type: 'string', required: true, description: 'The step name, one of START_STEPS in src/shared/start-cost.ts.', example: 'restoring' },
      { key: 'says', type: 'string', required: true, description: 'What the step is, in the words of its declaration.', example: "The reads that restored the project's knowledge before the run wrote anything outside its own session record." },
      { key: 'operations', type: 'string[]', required: true, description: 'The operation names this step was counted by, from src/shared/ops.ts. Empty for the step that ends the start.', example: ['project.onboarding', 'project.brief'] },
      { key: 'requests', type: 'number', required: true, description: 'How many requests of this step the office answered. Zero means none of this kind, which the absent times say too.', example: 2 },
      { key: 'firstAt', type: 'date', required: false, description: 'When the first thing of this step happened, local wall-clock. Absent means no request of this kind.', example: '2026-09-15 10:40:00' },
      { key: 'lastAt', type: 'date', required: false, description: 'When the last thing of this step happened, local wall-clock. Absent means no request of this kind.', example: '2026-09-15 10:40:02' },
      { key: 'spentMs', type: 'number', required: false, description: 'Wall-clock milliseconds the start spent in this step. Absent means no request of this kind, never zero.', example: 2000 },
      { key: 'tokens', type: 'number', required: false, description: 'Tokens attributed to this step, absent unless a runtime reported usage per request.', example: 1200 },
      { key: 'tokensSays', type: 'string', required: false, description: 'Why there is no per-step token number, when there is not one.', example: 'Tokens are known for the whole start, not for each step.' },
      { key: 'endsTheStart', type: 'boolean', required: false, description: 'True only on the step that is the first write outside the session record.', example: true },
    ],
  },

  UsageReceipt: {
    name: 'UsageReceipt',
    description: 'Usage read from a runtime envelope. Every field is optional: absent means not given, and zero is a value. The runtime\'s own cost is recorded where the runtime gave one. A price is estimated from a price table the person sets, kept beside that cost and never instead of it.',
    fields: [
      ...USAGE_NUMBERS.map((key) => ({ key, type: 'number', required: false, description: key === 'durationMs' ? 'Duration in milliseconds supplied by the runtime.' : key === 'costUsd' ? 'Cost in USD supplied by the runtime.' : 'The runtime supplied this token count; cache overlap is stated separately.', example: 0 })),
      { key: 'inputIncludesCached', type: 'boolean', required: false, description: 'True when the input count already includes cached input. Absent means the envelope did not establish overlap.', example: true },
      ...['model', 'runtime', 'source', 'says'].map((key) => ({ key, type: 'string', required: false, description: key === 'model' ? 'The model named by the runtime output, never the requested model inferred from settings.' : key === 'source' ? 'The command output format and event that supplied these facts.' : key === 'says' ? 'What the inspected output did not supply or why it could not be read.' : 'The adapter that read this output.', example: key === 'runtime' ? 'codex' : 'Not given in this envelope' })),
      { key: 'modelRequested', type: 'string', required: false, description: 'The model the run asked its runtime for, in the runtime\'s own name. It is never read as the model that served the run, and never written into `model`. Absent means nobody recorded it.', example: 'deepseek-flash' },
      { key: 'paidBy', type: 'string', required: false, description: 'Which login the run ran under, named by where it came from (a variable or a credentials file), or "not reported". Never an account guessed.', example: 'the Claude Code login in CLAUDE_CODE_OAUTH_TOKEN' },
      { key: 'ranIn', type: 'string', required: false, description: 'Where the run ran: "in the sandbox <name>", or "on the host".', example: 'in the sandbox w13p' },
      { key: 'readAt', type: 'date', required: false, description: 'When a hook or tool read the usage so far, local wall-clock. A stop leaves a receipt read in the last ten minutes as it is. Absent on a receipt read once at the end.', example: '2026-10-05 11:50:00' },
      { key: 'outsideSpend', type: 'OutsideSpend[]', required: false, description: 'Money the run spent on paid services outside the office, each named by its service, as whoever paid wrote it. Absent means nobody wrote any.', example: [{ service: 'OpenRouter', usd: 0.42 }] },
    ],
  },

  ReportedCompaction: {
    name: 'ReportedCompaction',
    description: 'One compaction the run\'s runtime reported. Today only the session hook writes one, when Claude Code starts the session again with SessionStart source "compact". Nothing infers one from a gap, a token count or a restart.',
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When it was reported, by the office\'s local wall clock (the answeredAt of GET /api/after-a-compaction).', example: '2026-10-10 09:12:00' },
      { key: 'what', type: 'string', required: false, description: 'The reporter\'s own words for it.', example: 'Claude Code reported a compaction (SessionStart source compact)' },
    ],
  },

  OutsideSpend: {
    name: 'OutsideSpend',
    description: 'One amount a run spent on a paid service outside the office, written by whoever paid it. Nothing estimates it.',
    fields: [
      { key: 'service', type: 'string', required: true, description: 'The service that was paid, by its own name.', example: 'OpenRouter' },
      { key: 'usd', type: 'number', required: true, description: 'The amount in US dollars, as the service charged it.', example: 0.42 },
      { key: 'says', type: 'string', required: false, description: 'What the money was for, or where the amount was read.', example: 'Two reviews by a model OpenRouter serves.' },
      { key: 'at', type: 'date', required: false, description: 'When it was written, local wall-clock.', example: '2026-10-05 11:00:00' },
    ],
  },

  RanAs: {
    name: 'RanAs',
    description:
      'WHICH DURABLE AGENT ONE RUN WORKED AS, IN ONE PROJECT. A session is a process and it dies; an agent is the ' +
      'identity that does not. One process working across two projects is the ordinary case here, so this is a ' +
      'list with AT MOST ONE ENTRY PER PROJECT, and a second entry naming a different agent for a project the run ' +
      'is already filed under is refused rather than overwritten.',
    fields: [
      {
        key: 'workspaceId',
        type: 'string',
        required: true,
        description: 'Which project this run worked as that agent in.',
        example: 'greenhouse',
      },
      {
        key: 'agentId',
        type: 'string',
        required: true,
        description: 'The id of the record of kind "agent" this run was working as.',
        example: 'aGtxQ1xBvNa2',
      },
    ],
  },

  CheckAskedAgainFrom: {
    name: 'CheckAskedAgainFrom',
    description: 'The earlier ask and check session that used the one automatic whole-run repeat after two completed answers gave no verdict.',
    fields: [
      { key: 'message', type: 'string', required: true, description: 'The earlier ask. Its delivery records the new ask that answered its no-verdict ending.', example: 'earlier-ask' },
      { key: 'session', type: 'string', required: true, description: 'The tool session that answered the earlier ask with no verdict. The secretary line names it and the repeat session if both fail this way.', example: 'earlier-check' },
    ],
  },
  AWorkerCheckNotAsked: {
    name: 'AWorkerCheckNotAsked',
    description: 'Why the office asked no separate worker check at its seal. This is not a settlement.',
    fields: [
      { key: 'why', type: "'worker-of-a-round'", required: true, description: 'The worker is checked inside its supervisor’s round.', example: 'worker-of-a-round' },
      { key: 'starter', type: 'ParticipantRef', required: true, description: 'The registered supervisor who started the worker.', example: { kind: 'agent', id: 'synthetic-supervisor' } },
      { key: 'decision', type: 'string', required: false, description: 'Only in a note written before this field was dropped: the decision under which no separate check was asked. No new note writes it.', example: 'madeUpNoteId' },
    ],
  },
  /**
   * WHAT THE OFFICE DID WHEN A RUN SAID ITS WORK WAS FINISHED. Criterion C28.
   *
   * A subagent saying it is done does not end it, and until 7 September 2026 nothing happened next
   * unless somebody typed a command in a terminal. Now the office asks for the check itself, at the
   * moment the finish is declared, by writing the inspector a message: the message worker starts
   * the run from that, the way it starts every run, so no second starting path exists and nobody
   * holds a terminal.
   */
  TheCheckTheOfficeAskedFor: {
    name: 'TheCheckTheOfficeAskedFor',
    description:
      'THE CHECK THE OFFICE ASKED FOR WHEN THIS RUN DECLARED A FINISH. It says when it asked, whom it asked, the ' +
      'message that starts the inspector\'s run, and the checkout it named. `askedOf` is null where nobody holds ' +
      'the inspector card: then nothing is started, the finish is still recorded as one nobody released, and the ' +
      'starter is told by name — a finish quietly waiting for a checker who does not exist is the shape of ' +
      'failure this design exists against. It is also what stops a run patched to finished twice getting two ' +
      'inspectors started on it. At a supervisor’s worker seal under full review, notAsked instead records why ' +
      'the round covers the worker, with no ask message or inspector. This note does not settle the run.',
    fields: [
      { key: 'notAsked', type: 'AWorkerCheckNotAsked', required: false, description: 'No separate worker check was asked at the seal. Its supervisor is named and says explains why. No message, askedOf or reviewLevel is written with this note.', example: { why: 'worker-of-a-round', starter: { kind: 'agent', id: 'synthetic-supervisor' } } },
      { key: 'execution', type: 'Record<string, unknown>', required: false, description: 'The office tool run, its log, model and minutes, and its endedAt or failed reason. ending is "no-verdict" only when both model answers completed without a verdict; other failures and stops do not carry it.', example: { session: 'check-run', log: '/check/output.log', model: 'sonnet', minutes: 40 } },
      { key: 'askedAgainFrom', type: 'CheckAskedAgainFrom', required: false, description: 'The earlier ask and its check session whose completed second answer gave no verdict. Present only on the one automatic whole-run repeat. Its own message and execution identify the new ask and session. A later explicit ask-again starts a new chain with this field absent.', example: { message: 'earlier-ask', session: 'earlier-check' } },
      {
        key: 'eligibility', type: 'Record<string, unknown>', required: false,
        description: 'The office’s eligibility decision, including its stable code, missing or unknown facts, and next act. A refusal starts no check.',
        example: { eligible: false, code: 'CHECK_NOT_ELIGIBLE', missing: [{ fact: 'submittedTip', state: 'unknown' }], says: 'The submitted tip is unknown.', nextAct: 'Record a submitted tip.' },
      },
      {
        key: 'askedAt',
        type: 'string',
        required: true,
        description: 'When the office recorded the ask or the reason it asked none, in local time.',
        example: '2026-09-07 18:04:00',
      },
      {
        key: 'askedOf',
        type: 'string',
        required: false,
        description:
          'The inspector it asked, by handle. Absent on a notAsked note. Otherwise absence means nobody holds the inspector card, which is a different ' +
          'fact from nobody having been asked yet: the office looked, found no holder, and said so in `says`.',
        example: 'permissions-drafter',
      },
      {
        key: 'message',
        type: 'string',
        required: false,
        description:
          'The message whose delivery starts the run — the inspector\'s where one holds the card, the starter\'s ' +
          'where none does. ABSENT where nothing is recorded as having started this run\'s agent, so there was ' +
          'nobody to tell either.',
        example: 'FXxn0p80h_iQ',
      },
      {
        key: 'checkout',
        type: 'TheRunsCheckout',
        required: true,
        description: 'Which checkout the check was told to read, and which branch it was cut from.',
        example: { directory: '/srv/mole-office-fixtures/.cache/mole-office/worktrees/code-3', cutFrom: 'main' },
      },
      {
        key: 'only',
        type: 'string[]',
        required: false,
        description:
          'THE PATHS THIS CHECK IS SCOPED TO, when the office asked for a scoped check (`the-inspector.mjs --only`): the ' +
          'merge queue asking again about the files whose content changed when an entry was put on top of the main ' +
          'world. The message worker passes them to the tool. Absent means a check of the whole submission.',
        example: ['src/server/lib/inspection.ts'],
      },
      {
        key: 'needsJudgment',
        type: 'PathThatNeedsJudgment[]',
        required: false,
        description:
          'THE PROTECTED PATHS A CHECKER TOOL HANDED ON for this check to judge, which the message worker ' +
          'passes to the tool with `--needs-judgment`. Absent means nobody handed a list.',
        example: [{ path: 'design/flows/ACCEPTANCE.md', why: 'A protected path that is not a generated file.' }],
      },
      {
        key: 'yeses',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'THE YESES AN EARLIER REVISION OF THE OFFICE ASKED THIS CHECK WITH: the run they were of, and the size and the ' +
          'sha256 of the file it held of them, or why there was no file. Nothing writes or reads it now. It stays declared ' +
          'so that a run whose check holds it still takes its own writes. Absent on every check asked since.',
        example: { of: 'run-id', outcome: 'none', says: 'Run run-id handed over no yeses before its seal, so the office holds no file of them.' },
      },
      {
        key: 'reviewLevel',
        type: unionOf(REVIEW_LEVELS),
        required: false,
        description:
          'HOW MUCH REVIEW THIS PROJECT ASKED FOR WHEN THE FINISH WAS DECLARED. ' +
          '`none` starts no inspector and the secretary confirms the run directly; `light` starts no inspector ' +
          'and the report goes to the secretary, who answers; `full` is the inspector, exactly as before. It is ' +
          'written at the moment the office acted and never looked up again, because the question a reader has ' +
          'later is what the office did on the day and somebody may change the level next week. ABSENT means the ' +
          'run finished before the level existed, which is a different fact from a run at `full`.',
        example: 'light',
      },
      {
        key: 'landedByHand',
        type: 'LandedByHand',
        required: false,
        description:
          'HOW THIS RUN\'S CONTENT REACHED MAIN BY HAND, NOT THROUGH THE MERGE QUEUE. ' +
          'Absent means nobody recorded that it did, which is the ordinary case. It adds no standing: the run is closed, and ' +
          'the sentence about it says where its content went.',
        example: {
          commit: 'e4c1661aaabb83d46a5fe7dd7ff67ef640363191',
          lane: '/srv/mole-office-fixtures/projects/mole-office',
          by: { kind: 'agent', id: 'secretary-1' },
          at: '2026-09-26 09:30:00',
          because: 'The queue could not land it, so the secretary landed it by hand at 04:52.',
          contains: { how: 'ancestor', laterCommit: 'e4c1661aaabb83d46a5fe7dd7ff67ef640363191', commits: [{ commit: 'e4c1661aaabb83d46a5fe7dd7ff67ef640363191', as: 'e4c1661aaabb83d46a5fe7dd7ff67ef640363191' }] },
        },
      },
      {
        key: 'superseded',
        type: 'SupersededRun',
        required: false,
        description:
          'THE LATER RUN THAT OVERTOOK THIS ONE: one on the same ' +
          'branch, or one that was checked and merged and holds this run\'s commits. Absent means the run was not closed as ' +
          'superseded, which is the ordinary case. It is written here when the run holds a check, and on the run\'s ' +
          'top-level `superseded` when it holds none; `theSupersededOn` in src/shared/releasing.ts ' +
          'reads both. It rewrites nothing: the seal, the report and the refusals stay as they were. A superseded run ' +
          'reads as standing `superseded` and no longer counts as a check owed.',
        example: {
          by: 'X-DaqTi6vb5U',
          at: '2026-09-16 15:02:00',
          byWhom: { kind: 'agent', id: 'secretary-1' },
          because: 'The later run on this branch finished the same work and its check released and confirmed it.',
        },
      },
      {
        key: 'says',
        type: 'string',
        required: true,
        description: 'The whole of it in one or two plain sentences, for somebody reading the run rather than the fields.',
        example: 'The office asked permissions-drafter, who holds the inspector card, to check this run.',
      },
    ],
  },

  /**
   * WHAT ONE ASSEMBLY OF A CHECK PROMPT MEASURED. Criterion C28's second half.
   *
   * No person is ever asked to run a command in a terminal: everything a person does can be done in Mole Office.
   * The tool prints these on `--dry` and they used to exist only in the terminal it printed to.
   */
  InspectionSettings: {
    name: 'InspectionSettings',
    description: 'The model and minutes resolved for one check, including its command line overrides.',
    fields: [
      { key: 'model', type: 'string', required: true, description: 'The model given to the check.', example: 'sonnet' },
      { key: 'minutes', type: 'number', required: true, description: 'How many minutes the check has to finish.', example: 40 },
    ],
  },
  WhatTheCheckWouldRead: {
    name: 'WhatTheCheckWouldRead',
    description:
      'WHAT A CHECK OF THIS RUN WOULD READ, from the last time one was assembled: the prompt\'s size, what the ' +
      'whole of the office regulations at full would have been, which chapters were written out further and at what cost, the ' +
      'changed files inside the work area and the ones outside it, and the commit it was all read against. It is ' +
      'the LAST assembly and not a list of them, because what a person asks is what the check that would run now ' +
      'would read. ABSENT MEANS NOBODY HAS ASSEMBLED ONE, which is a check nobody has looked at rather than a ' +
      'check with nothing in it.',
    fields: [
      { key: 'assemblyId', type: 'string', required: false, description: 'The id of this assembly, including when another happened in the same second.', example: 'check-read-1' },
      { key: 'execution', type: 'InspectionSettings', required: false, description: 'The settings resolved for this check. Absent means nobody recorded them.', example: { model: 'sonnet', minutes: 40 } },
      { key: 'at', type: 'string', required: true, description: 'When it was assembled, in local time.', example: '2026-09-07 18:04:00' },
      { key: 'bytes', type: 'number', required: true, description: "The prompt's size in bytes.", example: 171420 },
      {
        key: 'wholeCodeBytes',
        type: 'number',
        required: true,
        description: 'What the whole of the office regulations at full would have been. The difference is the saving the semantic levels exist for.',
        example: 219544,
      },
      {
        key: 'chaptersAt',
        type: 'ChapterWrittenOut[]',
        required: true,
        description: 'Every chapter written out further than its name, with the level it was written at and the bytes it took.',
        example: [{ chapter: 5, level: 'full', bytes: 18422 }],
      },
      {
        key: 'inside',
        type: 'string[]',
        required: true,
        description: 'The changed paths inside the work area. These are the ones the check reads.',
        example: ['src/server/lib/inspection.ts'],
      },
      {
        key: 'outside',
        type: 'string[]',
        required: true,
        description: 'The changed paths outside it. These are named to the check and never read by it.',
        example: ['src/web/pages/RecordPage.tsx'],
      },
      {
        key: 'base',
        type: 'TheBaseUsed',
        required: false,
        description: 'The commit the changes were read against and how it was found. Absent means nobody said, and the prompt says so too.',
        example: { ref: '7009bd36', how: 'fork point', says: 'The base is the fork point.' },
      },
      {
        key: 'read',
        type: 'WhatWasRead',
        required: false,
        description:
          'WHICH WORKTREE AND WHICH TIP THE CHECK READ. A check reads a detached worktree of its ' +
          "own at the run's tip, never the worker's own tree and never the office's checkout. Whether it did is " +
          'not something this server can see, because nothing under src/ reads a working tree, so the check says ' +
          'and this carries it. Absent means nobody said, which is not the same as a check that read the right ' +
          'tree.',
        example: {
          worktree: '/srv/mole-office-fixtures/.cache/mole-office/worktrees/a-check-of-o2RjuOUEIwpf',
          tip: '83fababc40337490f1fd53fb26cd60a59080a261',
          ofItsOwn: true,
          says: 'This check read a detached worktree of its own and removed it when the verdict was written.',
        },
      },
      {
        key: 'pluginRule',
        type: 'ThePluginRule',
        required: false,
        description:
          "WHICH WAY THE PLUGIN RULE WENT for this check of git work: the rule that a change inside one plugin's folder is read only when it changes the manifest, since wave 13x round 17. " +
          'Absent on a files seal, whose files never land in a plugins folder, and on an assembly from before the rule.',
        example: { plugin: { id: 'made-up', manifest: false }, read: false, says: 'A plugin-only change to plugins/made-up that leaves its manifest alone, so its code is not read.' },
      },
      {
        key: 'needsJudgment',
        type: 'TheNeedsJudgmentListAskedAndUsed',
        required: false,
        description:
          'THE PATHS A CHECKER TOOL HANDED ON, AS THE CHECK\'S TOOL ASKED AND AS THE CHECK USED THEM (wave 13j). A path the ' +
          'sealed change does not touch is dropped from the list, and the prompt says so in one line. Absent means nobody ' +
          'handed a list, or the assembly is from before this was kept.',
        example: { asked: ['design/flows/ACCEPTANCE.md', 'design/elsewhere/ACCEPTANCE.md'], used: ['design/flows/ACCEPTANCE.md'] },
      },
      {
        key: 'says',
        type: 'string',
        required: true,
        description: 'The whole of it in plain sentences, for somebody reading the run rather than the fields.',
        example: '171420 bytes, where the whole of the office regulations at full would have been 219544.',
      },
    ],
  },

  /** The needs-judgment list of one check, as asked and as used (wave 13j). */
  TheNeedsJudgmentListAskedAndUsed: {
    name: 'TheNeedsJudgmentListAskedAndUsed',
    description:
      "THE NEEDS-JUDGMENT LIST OF ONE CHECK, AS ITS TOOL ASKED AND AS THE CHECK USED IT. The paths in `asked` and not in " +
      '`used` were dropped because the sealed change does not touch them. A list left with no path is refused, so ' +
      '`used` is empty only when `asked` is.',
    fields: [
      { key: 'asked', type: 'string[]', required: true, description: 'Every path on the list the check\'s tool handed over, in its order.', example: ['design/flows/ACCEPTANCE.md', 'design/elsewhere/ACCEPTANCE.md'] },
      { key: 'used', type: 'string[]', required: true, description: 'The paths the check judges: those of `asked` that the change touches.', example: ['design/flows/ACCEPTANCE.md'] },
    ],
  },

  /** Which way the plugin rule went for one check. */
  ThePluginRule: {
    name: 'ThePluginRule',
    description:
      "WHICH WAY THE PLUGIN RULE WENT FOR ONE CHECK. Under the plugin rule, the inspector does not read a change " +
      "that touches only one plugin's folder and leaves its manifest alone, and reads every other change as before. The " +
      'secret scan and the privacy gate still run, at the merge queue\'s test step. Worked out from every changed path by ' +
      'thePluginRuleOf in src/shared/plugin-change.ts, the one rule the inspector tool, the office and the merge queue use.',
    fields: [
      {
        key: 'plugin',
        type: 'APluginOnlyChange',
        required: false,
        description: 'The plugin the change touches alone, and whether it touches its manifest. Absent means the change is not plugin-only, which `says` says.',
        example: { id: 'made-up', manifest: false },
      },
      { key: 'read', type: 'boolean', required: true, description: 'Whether the check reads the change. False only for a plugin-only change that leaves its manifest alone.', example: false },
      {
        key: 'says',
        type: 'string',
        required: true,
        description: 'Which way it went, in one sentence.',
        example: 'A plugin-only change to plugins/made-up that leaves its manifest alone, so its code is not read.',
      },
    ],
  },

  /** A change inside one plugin's folder. The plan VlQueUhVQQmi. */
  APluginOnlyChange: {
    name: 'APluginOnlyChange',
    description: "A CHANGE THAT TOUCHES ONLY ONE PLUGIN'S FOLDER, plugins/<id>/, read by aPluginOnlyChange in src/shared/plugin-change.ts.",
    fields: [
      { key: 'id', type: 'string', required: true, description: "The plugin's id, which is the name of its folder.", example: 'made-up' },
      { key: 'manifest', type: 'boolean', required: true, description: 'Whether the change touches its manifest, plugins/<id>/plugin.json.', example: false },
    ],
  },

  /** Which worktree and which tip one check read. Criterion C30. */
  WhatWasRead: {
    name: 'WhatWasRead',
    description:
      "WHICH WORKTREE AND WHICH TIP ONE CHECK READ. A check reads a worktree of its own. `ofItsOwn: false` is a real answer and not a " +
      "gap: it says this check read somebody else's tree, which is the thing this shape exists to make " +
      'visible. Measured 7 September 2026: a rehearsal ran two suites inside the worker\'s own worktree while ' +
      'the worker\'s suite ran there, so neither result was evidence.',
    fields: [
      { key: 'unsealed', type: 'boolean', required: false, description: 'This verdict judged an inventoried legacy tip without a seal.', example: true },
      { key: 'sealId', type: 'string', required: false, description: 'The immutable submission this check judged.', example: 'seal-id' },
      { key: 'sealHash', type: 'string', required: false, description: 'The full SHA-256 digest of that submission.', example: 'hash' },
      // adTmco_wIzln, note 52ZNPB44bOPb; invariants 2 and 5 of USER.md: absence is no kind claim.
      { key: 'sealKind', type: "'git' | 'records' | 'files'", required: false, description: 'The sealed submission kind the check read. Absent on unsealed readings and older checks; an absent tip does not name a kind.', example: 'git' },
      { key: 'linkEvidence', type: "'read' | 'sealed-before-links'", required: false, description: 'On a records seal, whether the check read the links the seal pinned: read, or sealed-before-links for a seal made before seals pinned links, which holds no link evidence. Absent on other seals, on older checks, and where the office did not say which links the seal pinned.', example: 'read' },

      {
        key: 'worktree',
        type: 'string',
        required: true,
        description: 'The whole path of the tree the check read.',
        example: '/srv/mole-office-fixtures/.cache/mole-office/worktrees/a-check-of-o2RjuOUEIwpf',
      },
      {
        key: 'tip',
        type: 'string',
        required: false,
        description: 'The commit that tree was at. Absent means git could not be asked.',
        example: '83fababc40337490f1fd53fb26cd60a59080a261',
      },
      {
        key: 'ofItsOwn',
        type: 'boolean',
        required: true,
        description:
          "True when the check cut that tree for itself and removed it after. False when it read the checkout it " +
          'was given, which a check may not do and which this field is here to show.',
        example: true,
      },
      {
        key: 'says',
        type: 'string',
        required: true,
        description: 'The whole of it in words, written by the check that read it.',
        example: 'This check read a detached worktree of its own and removed it when the verdict was written.',
      },
      {
        key: 'only',
        type: 'string[]',
        required: false,
        description:
          'THE ONLY PATHS A SCOPED CHECK JUDGED (`the-inspector.mjs --only`). The verdict follows file content, so ' +
          'a check again of a submission judges only the files whose content changed and the rest keep the earlier ' +
          'verdict. Absent means the check judged the whole submission. A verdict that carries this covers these ' +
          'paths and nothing else.',
        example: ['src/server/lib/inspection.ts'],
      },
      {
        key: 'needsJudgment',
        type: 'PathThatNeedsJudgment[]',
        required: false,
        description:
          'THE PROTECTED PATHS A CHECKER TOOL HANDED THIS CHECK TO JUDGE, and why. An empty list means a checker ran ' +
          'and handed nothing on. Absent means nobody handed the check a list.',
        example: [{ path: 'design/flows/ACCEPTANCE.md', why: 'A protected path that is not a generated file.' }],
      },
      {
        key: 'staged',
        type: 'string',
        required: false,
        description:
          "A FILES SEAL ONLY: the folder the check's copy was made from. The model never read " +
          'that folder itself: the tool copied each sealed file out of it and compared its sha256 and mode with the ' +
          'seal first. Absent on any other kind of check.',
        example: '/srv/mole-office-fixtures/.cache/mole-office/staged/recovery-3',
      },
      {
        key: 'before',
        type: 'Record<string, string>',
        required: false,
        description:
          'A FILES SEAL ONLY: for every sealed path where a file was already landed, the sha256 of that landed file — ' +
          "the before the model was shown beside the file that replaces it. The merge queue requires a modify " +
          "operation's `before` to be exactly this hash, so a release covers the text a file replaced as well as the " +
          'text it lands. Absent means no sealed path had a file landed at it.',
        example: { 'runs/console_1/RECOVERY.md': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
      },
    ],
  },

  /** WHAT ONE CHECK'S MODEL WROTE INTO THE OFFICE WHILE IT RAN. Acceptance finding 44. */
  WroteIntoTheOffice: {
    name: 'WroteIntoTheOffice',
    description:
      "WHAT ONE CHECK'S MODEL WROTE INTO THE OFFICE WHILE IT RAN, counted by the tool that started it from the " +
      'records created between two moments. Acceptance finding 44, 23 September 2026: a check\'s model ran the ' +
      "tree's browser tests, the app read the live office's address from the model's environment, and 65 records " +
      'were filed into the live office. The tool counts the records the office lists for the window whose working ' +
      'directory was inside the check\'s own worktree or whose creating session was the check\'s session. The TREE ' +
      'WROTE NOTHING is `count: 0` with no ids; a tool that could not count leaves the field off a release or a ' +
      'refusal rather than claiming zero: when the door could not be read, or when it listed only the first part ' +
      'of a busy window, since it cannot page on and a part would be a lower bound.',
    fields: [
      {
        key: 'count',
        type: 'number',
        required: true,
        description: 'How many of the records created in the window belonged to this check\'s run.',
        example: 2,
      },
      {
        key: 'ids',
        type: 'string[]',
        required: true,
        description: 'The record ids behind that count, in the order the office listed them.',
        example: ['O2RjuOUEIwpf', 'AWT42d6t8JTx'],
      },
      {
        key: 'from',
        type: 'date',
        required: true,
        description: 'The first moment of the window the model ran in, local wall clock.',
        example: '2026-09-23 00:08:00',
      },
      {
        key: 'to',
        type: 'date',
        required: true,
        description: 'The last moment of the window the model ran in, local wall clock.',
        example: '2026-09-23 00:10:00',
      },
    ],
  },

  /** One path a checker tool could not decide, handed to the inspector. Sandbox v1 decision R4. */
  PathThatNeedsJudgment: {
    name: 'PathThatNeedsJudgment',
    description:
      'ONE PATH A CHECKER TOOL COULD NOT DECIDE, AND WHY. Everything a program can decide with certainty is a ' +
      'tool; the part that needs judgment goes to the inspector. For Mole Office that is a protected path the ' +
      'submission changed that is not a generated file the tool could regenerate and compare.',
    fields: [
      { key: 'path', type: 'string', required: true, description: 'The path, as git spells it.', example: 'design/flows/ACCEPTANCE.md' },
      { key: 'why', type: 'string', required: true, description: 'Why the tool could not decide it, in plain words.', example: 'A protected path that is not a generated file.' },
    ],
  },

  /** One chapter written out further than its name, and what that cost. Criterion C23. */
  ChapterWrittenOut: {
    name: 'ChapterWrittenOut',
    description:
      'ONE CHAPTER OF THE OFFICE REGULATIONS WRITTEN OUT FURTHER THAN ITS NAME, with the semantic level it was written ' +
      'at and the bytes it took. An inspector loads no chapter at `full` that the brief did not ' +
      'name, and this is what that is measured on.',
    fields: [
      { key: 'chapter', type: 'number', required: true, description: 'Which chapter, by its number.', example: 5 },
      { key: 'level', type: 'string', required: true, description: 'The semantic level it was written at.', example: 'full' },
      { key: 'bytes', type: 'number', required: true, description: 'What it took, in bytes.', example: 18422 },
    ],
  },

  /** Which commit a check's changes were read against, and how that commit was found. Criterion C25. */
  TheBaseUsed: {
    name: 'TheBaseUsed',
    description:
      'WHICH COMMIT A CHECK READ ITS CHANGES AGAINST, AND HOW THAT COMMIT WAS FOUND. Measured on 7 September ' +
      '2026: the first real check was assembled against a commit that is not an ancestor of the branch it was ' +
      "checking, and eight files of other people's work went into the diff the inspector was asked to hold the " +
      'run to. The prompt carried the diff and never said where the diff came from.',
    fields: [
      { key: 'ref', type: 'string', required: true, description: 'The commit, as git resolved it.', example: '7009bd36' },
      {
        key: 'how',
        type: "'fork point' | 'typed'",
        required: true,
        description: '`fork point` = worked out from the branch this checkout was cut from. `typed` = somebody said it with --against.',
        example: 'fork point',
      },
      {
        key: 'says',
        type: 'string',
        required: true,
        description: 'The whole of it in words, written by whoever found it.',
        example: "The base is the fork point 7009bd36: the merge base of this checkout's HEAD and main.",
      },
    ],
  },

  /** Where a run's work is on disk, and which branch that checkout was cut from. Criterion C28. */
  TheRunsCheckout: {
    name: 'TheRunsCheckout',
    description:
      "WHERE A RUN'S WORK IS, as the office read it off the run's own record when it asked for the check. Both " +
      'halves may be null, and null means nobody recorded one rather than that there is none.',
    fields: [
      {
        key: 'directory',
        type: 'string',
        required: false,
        description: 'The whole path the run worked in. Absent means nobody recorded one.',
        example: '/srv/mole-office-fixtures/.cache/mole-office/worktrees/code-3',
      },
      {
        key: 'cutFrom',
        type: 'string',
        required: false,
        description: 'The branch that checkout was cut from. Absent means nobody recorded one, and the check then reads the repository\'s trunk.',
        example: 'main',
      },
    ],
  },

  /**
   * WHAT THE OFFICE DID WITH A RUN'S SEAL FOR THE MERGE QUEUE, KEPT ON THE RUN. Wave 13u round 93;
   * src/shared/merge-queue-at-the-seal.ts.
   */
  QueuedAtTheSeal: {
    name: 'QueuedAtTheSeal',
    description:
      "WHAT THE OFFICE DID WITH THIS RUN'S SEAL, for a line that is turned on. Written only by the office, at the seal and " +
      'each time it decides a waiting seal again. `outcome` says which of five it was; the other fields say what it names.',
    fields: [
      { key: 'outcome', type: "'queued' | 'already' | 'waits' | 'not-queued' | 'cannot'", required: true, description: 'Submitted by the office; already in the queue; waiting; not queued because the entry it waited for ended; or refused by the queue.', example: 'waits' },
      { key: 'commit', type: 'string', required: true, description: "The seal's commit.", example: '3f2a9c1e0000000000000000000000000000beef' },
      { key: 'at', type: 'date', required: true, description: 'When the office wrote it, in local wall clock.', example: '2026-10-25 17:30:00' },
      { key: 'entry', type: 'string', required: false, description: 'The merge entry: the one submitted, the one already there, the one waited for, or the one that ended.', example: 'entry-id' },
      { key: 'for', type: "'an-earlier-entry' | 'the-hold'", required: false, description: 'With `waits`: an entry of the same line still under way, or the hold on the queue.', example: 'an-earlier-entry' },
      { key: 'ended', type: "'bounced' | 'withdrawn'", required: false, description: 'With `not-queued`: how the entry it waited for ended.', example: 'bounced' },
      { key: 'told', type: 'string', required: false, description: "With `not-queued`: the office's message to the line's starter, by record id.", example: 'message-id' },
      { key: 'notTold', type: 'string', required: false, description: 'With `not-queued` and nobody told: why.', example: 'Nobody is recorded as having started this line.' },
      { key: 'says', type: 'string', required: false, description: "With `cannot`: the merge queue's refusal, in its own words.", example: 'Merge entry entry-id is the same work and it is landing, so it can no longer be superseded.' },
    ],
  },

  /**
   * WHAT THE OFFICE DID AT A RUN'S SEAL, KEPT ON THE RUN IN ONE FIELD WITH TWO PARTS. Wave 13u round 96, which put the two
   * fields of rounds 93 and 94 into one; src/shared/merge-queue-at-the-seal.ts. A run sealed by an earlier revision of the
   * office may also hold a third part, `yeses`, which nothing reads or writes now.
   */
  AtTheSeal: {
    name: 'AtTheSeal',
    description:
      "WHAT THE OFFICE DID AT THIS RUN'S SEAL, for a line that is turned on, in two parts. Written only by the office. " +
      'Each writer writes its own part, and the other part stays as it was. A run sealed by an earlier revision of the ' +
      'office may also hold a third part, `yeses`, which nothing reads or writes now.',
    fields: [
      {
        key: 'queued',
        type: 'QueuedAtTheSeal',
        required: false,
        description:
          'What the office did with the seal for the merge queue: submitted it, found it already there, keeps it waiting ' +
          'for an earlier entry of the same line or for the hold, did not queue it because that entry ended without ' +
          'landing, or was refused. Written at the seal and each time the office decides a waiting seal again. ABSENT ' +
          'MEANS THE OFFICE DECIDED NOTHING FOR THE QUEUE: the setting that queues at the seal was off, or the run was not ' +
          'sealed with a git submission.',
        example: { outcome: 'waits', for: 'an-earlier-entry', entry: 'entry-id', commit: '3f2a9c1e0000000000000000000000000000beef', at: '2026-10-25 17:30:00' },
      },
      {
        key: 'nextRound',
        type: 'NextRoundAtTheSeal',
        required: false,
        description:
          "What the office did about the next round: asked for it with the sandbox's briefs/NEXT.md, found one already " +
          "asked, or asked nothing and says why. How the round then went is the run's `nextRound`. Written at the seal or " +
          'at the release, and `moment` says which. ABSENT MEANS THE OFFICE LOOKED AT NOTHING FOR THE NEXT ROUND: the ' +
          'setting that asks at the seal was off, and the run was not released while the setting that asks at the release was on.',
        example: { outcome: 'asked', moment: 'release', brief: { path: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j/briefs/NEXT.md', sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' }, at: '2026-10-25 17:30:00' },
      },
      {
        key: 'yeses',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'What an earlier revision of the office found of the yeses the run handed over before its seal: the size and ' +
          'the sha256 of the file it held for the run, or why there was nothing to read. Nothing writes or reads it now. ' +
          'It stays declared so that a run that holds it still takes its own writes. Absent on every run sealed since.',
        example: { outcome: 'none', moment: 'seal', says: 'Run run-id handed over no yeses before its seal, so the office holds no file of them.', at: '2026-11-07 19:30:00' },
      },
    ],
  },

  NextRoundAtTheSeal: {
    name: 'NextRoundAtTheSeal',
    description:
      "WHAT THE OFFICE DID ABOUT A RUN'S NEXT ROUND, at its seal for a line that is turned on, or at its release. Written " +
      'only by the office. `outcome` says which of three it was, and `moment` when.',
    fields: [
      { key: 'outcome', type: "'asked' | 'already' | 'not-asked'", required: true, description: 'Asked for the next round; found one already asked for this run; or asked nothing.', example: 'asked' },
      { key: 'moment', type: "'seal' | 'release'", required: false, description: 'When the office looked: at the seal, or when a check released the run. A note written before the release was a moment names none, and was written at the seal.', example: 'release' },
      { key: 'at', type: 'date', required: true, description: 'When the office wrote it, in local wall clock.', example: '2026-10-25 17:30:00' },
      { key: 'brief', type: 'Record<string, unknown>', required: false, description: 'With `asked`: the brief, as its path and the sha256 the office read.', example: { path: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/w13j/briefs/NEXT.md', sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' } },
      { key: 'says', type: 'string', required: false, description: 'With `already` or `not-asked`: who asked already, or why nothing was asked, in a sentence.', example: 'The sandbox holds no briefs/NEXT.md, so the office asked nothing.' },
    ],
  },

  // A RUN'S METHOD MARK, AND WHAT A DESIGN REMINDER NAMES AND HOW IT WAS JUDGED (part 6 of the design-first build).
  MethodMark: {
    name: 'MethodMark',
    description:
      'WHETHER A RUN IS METHOD WORK OR THE GO FOR A PILOT, said once by the person or by the agent that started the ' +
      "run's agent, with why. Written only by POST /api/runs/<run>/method-work, which writes who and when from the key.",
    fields: [
      { key: 'work', type: unionOf(METHOD_WORKS), required: true, description: 'Method work, or the go for a pilot. The project\'s rules at this trigger are asked before the seal.', example: 'method-work' },
      { key: 'because', type: 'string', required: true, description: 'Why the run is that, in words.', example: 'The run builds the grasp method the design chose.' },
      { key: 'by', type: 'ParticipantRef', required: true, description: 'Who marked it, written by the office from the key.', example: { kind: 'agent', id: 'Ag1e2n3t4i5d' } },
      { key: 'at', type: 'date', required: true, description: 'When it was marked. Local wall clock.', example: '2026-11-08 20:40:00' },
    ],
  },
}
