// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKER RUN A SUPERVISOR IN A SANDBOX ASKS FOR: THE DOOR THAT ASKS FOR IT, AND THE OFFICE'S HALF OF STARTING IT.
 * Wave 13j round loop-3, step 3 of "a supervisor runs its own loop" (block wUDMYyLGLvfq of pipeline UPsmFdztY5Xf). The
 * owner decided, as option B of a decision says, that a supervisor starts its own workers, and
 * the office only reminds how many it started. src/shared/worker-runs.ts holds the shape. It is built like the
 * next-round door (lib/next-round.ts), and the two share the sandbox, the brief and the launcher.
 *
 * THE ASK, `askForAWorkerRun`. Only the worker's registered starter may ask, proved by its own key, from a running run
 * of its own in a sandbox the office vouches for, named in the session header. It is refused, in words, for a retired
 * worker, a brief outside that sandbox, a run already serving the worker, no Casting row for the worker card, and a
 * message worker that is off. Counts are only reminded of. The ask is kept on the supervisor's run, under
 * `workerRuns`, and nothing is started by it. An ask that names no model rolls the worker card's Casting row through
 * the default router (lib/casting-roll.ts, a decision of the owner), once, and keeps the record of the roll on its
 * entry (round 46). An ask again on the same run, before the worker's run was filed, keeps the draw it already holds.
 *
 * THE CHOICE (wave 13j round loop-6; wave 13n round BQ). The ask may name a runtime and a model, both or neither. A
 * choice must be cast by one Casting row of the worker card in force for the project, the rows a roll chooses among,
 * and a choice no row casts is refused in words that name the rows read. A choice is kept on the ask with who chose it,
 * and is given to the launcher as chosen: a Codex model as openai/<model>, which the launcher's worker command requires.
 * An ask that names neither is given the Casting row its roll chose for the worker card. Either way the row must be one
 * the launcher can start and not held, and the ask keeps it as it read it: its id, its cells and, for a row with native
 * selection data, its selection revision. The row's model is given to the launcher by the rule a choice is given by, a
 * Codex model as openai/<model> (wave 13n round AG), and a native row's by its own program and model. An ask with a
 * choice makes no roll.
 *
 * THE START. The message worker on the host lists `theWorkerRunsToStart`, files a launcher run of its own that runs no
 * model, and asks `startingTheWorkerRun`, which checks everything again and reads the row the ask kept. A native row
 * must still be at the revision the ask read, and a row with no native data must still cast what the ask read, so a
 * probability or a mark may change and nothing else may. A changed, held or removed row fails the start, and no other
 * row is taken. A native row's selection is answered in the reply, and the launcher is given it as --selection. The
 * program and the model are the ask's choice, or else those of the row the ask's roll chose, read from the record the
 * ask kept. The start does not roll again, so the ask and the start give one row. The record is kept on the starting entry and
 * copied onto the worker's run when the run is filed, so the agent's later starts keep its roll.
 * It then runs `node tools/sandbox.mjs worker --parent <the supervisor's run>`, or for a dsh or OpenCode worker, chosen
 * or rolled,
 * `exec --agent` with `--worktree <sandbox>/worktrees/<worker>`, because `worker` takes claude-code and codex only and
 * `exec` with no --worktree would run in the sandbox's repo/. The
 * launcher files the worker's run with the office's key, under the launcher run, with the supervisor's run as its
 * parent: rule 4 of the parent rule in lib/records.ts lets it. The office mints the worker's key on that create
 * (`theWorkerRunThisRunStarts`, asked by the run-key door in api/records.ts). The worker's end wakes the supervisor
 * through the parent, as any child run's end does. The worker then says how the launcher ended
 * (`theWorkerRunsLauncherEnded`).
 *
 * GPU USE is booked through the booking doors as they are, by the supervisor's own run key acting for the worker's run
 * (lib/acting-for.ts). An overlap only reminds. Nothing here books.
 *
 * THE CUT (wave 13j, the round after loop-10). The ask chooses the commit the worker's worktree is cut from: a branch
 * or commit it names as `cutFrom`, or else the commit the asking run's own worktree stands at, read from its
 * `workingDirectory` when it asks. Either is refused, with a code, unless a branch or tag of the sandbox's repository
 * reaches it, because the worktree is made from that repository. The start gives the launcher `--cut-from <commit>`
 * to make the worker's worktree at when it is not there yet. A worktree that is there is used as it stands, and the
 * launcher is given `--cut-from` the commit it stands at, so that the run is filed at that commit. A cut the
 * ask named is refused while it is there, at the ask and again at the start, in words that name the folder, its branch
 * and its commit. When the worker's run is filed, the office keeps on it which commit was asked, whether it was used,
 * and the commit the run was filed at (`cutAsked`).
 *
 * A CLONE BESIDE REPO/ (wave 13j, the clone round). The ask may name one of the sandbox's clones as `clone`, by its
 * folder name or by its absolute path, and then cutFrom, or the asking run's own commit, is looked for in that clone
 * and not in repo/. It is never looked for in the other one. A clone is the sandbox's own when `<sandbox>/instance.json`
 * lists it under `clones`, as `up` records one and as the launcher's `--clone` reads it, and when its folder is
 * directly in the sandbox, links followed. The start gives the launcher `--clone <name>` before `--cut-from`. An ask
 * that names neither a clone nor a cutFrom has the asking run's own commit looked for in the listed clone its worktree
 * belongs to, if it belongs to one, as if the ask had named that clone (wave 13n round DP).
 *
 * THE EFFORT is not given to the launcher: the launcher asks the office for it itself, and passes the effort it is
 * answered. The starting entry records the office's answer to that same question, through `theEffortTheLauncherIsAnswered` in
 * lib/next-round.ts, which both doors use.
 *
 * WHAT IS NOT DONE HERE. A worker that restarts does not pick up a launcher run it started before; an ask left
 * `starting` with no launcher running may be asked again.
 */
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'

import { SYSTEM_LINES } from '@shared/groups.ts'
import { readCastingLabelIds, readCastingOutUntil, type CastingRow, type CastingSelection } from '@shared/casting.ts'
import { readCastingRoll, theLimitsOn, theStartOfARoll, type CastingRollRecord } from '@shared/casting-roll.ts'
import { moleOffice } from '@shared/participants.ts'
import { theReminderAStartWithNoWorkAreaCarries } from '@shared/a-start-with-no-work-area.ts'
import { aRoleNeedsARegisteredWorkArea, THE_WORKER } from '@shared/roles.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { nowStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { withArticle } from '@shared/work.ts'
import { kindWord } from '@shared/words.ts'
import {
  readTheWorkerPackage,
  readTheWorkerRun,
  theLauncherIsForThisWorkerRun,
  theRowAsTheAskReadIt,
  theStartOfTheRow,
  WORKER_RUNS,
  FOR_THE_PERSON,
  HOST_DEFAULT_PERMISSIONS,
  type AChosenRuntime,
  type AWorkerARunAskedFor,
  type TheCutAsked,
  type TheRowAWorkerIsGiven,
  type TheRunThatAskedForAWorker,
  type TheWorkerPackage,
  type TheWorkerRun,
  type TheWorkerPlace,
  type TheWorkerPlaceAsked,
  type TheWorkersARunStarted,
  type WorkerRunState,
} from '@shared/worker-runs.ts'
import { sqlite } from '../db/client.ts'
import { aWaitingStarterChangeSays } from './agent-starter.ts'
import { packageOf } from './delegation.ts'
import { readACastingLabelWord, theCastingLabelNames } from './casting-labels.ts'
import { theCanonicalAgentId, theOtherWorkerRunsWanted, theWorkerRunOf } from './registry-aliases/worker-runs.ts'
import { readRegistryAliases } from './registry-aliases/index.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from './gate-counts.ts'
import { aCastingById } from './a-casting-by-id.ts'
import { theRowsInForce } from './the-rows-in-force.ts'
import { theDefaultCasting, theLimitsNow } from './casting-roll.ts'
import { theKeyHolderIsTheRegisteredStarterOf } from './claims.ts'
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'
import { writeASystemLineToOne } from './groups.ts'
import { THE_OFFICE } from './the-office.ts'
import { theBriefAndItsWordsAt, theBriefAt, theEffortTheLauncherIsAnswered, theLauncherRunIsGoing, theSandboxTheOfficeVouchesFor, theWorkAreaDeclaredBeside } from './next-round.ts'
import { aFailedStartEmptiesTheAreaOfItsAsk, changeWorkArea, theDeclaredAreaWasSetSays, type RegisteredAgent } from './participants.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { theAgentRowAnIdNames } from './the-agent-row-an-id-names.ts'
import { theAgentTheKeyProves } from './the-agent-the-key-proves.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theHoldOn, theKeptRowAtTheStart, theModelARunStartsWith } from './run-models.ts'
import { aNameNamesTheSelection, THE_PROGRAM_A_RUNTIME_RUNS } from '../../config/launcher-selection.mjs'
import { gatePosition, settingValue } from '../../config/settings.mjs'
import { theRealLocation } from '../../config/files-area.mjs'
import { whyNotPlainPaths } from '../../config/a-workers-left-out-paths.mjs'
import { IT_IS_A_LINK, IT_IS_NOT_A_FILE, NOTHING_IS_THERE, whyNotAFileOfTheWorktree } from '../../config/a-workers-images.mjs'
import { theNextTryOfALongWait } from '../../config/a-long-wait.mjs'
import { getRecord, recordInWorkspace, theAgentOfAnAskedWorkerRunUnder, writeTheCastingRoll, writeTheCutAsked, writeTheImagesGiven, writeTheWorkerPackage, writeTheWorkerPlace, writeTheWorkerRun, type Actor } from './records.ts'
import { noRecordHasThisId } from './no-record-has-this-id.ts'
import { PanelError } from './panel-error.ts'
import { listResources } from './resources.ts'
import { readGit } from './resources.ts'
import { whyGitDidNotAnswer } from '@shared/why-git-did-not-answer.ts'
import { aRefusalForAnUnvouchedSandbox } from './a-refusal-for-an-unvouched-sandbox.ts'
import { theSandboxFolderOf } from './the-sandbox-folder-of.ts'
import { thisAgentWasRegisteredWithNoKeyOfItsOwn } from '../db/this-agent-was-registered-with-no-key-of-its-own.ts'
import { runServing } from './worker.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { listRepositories } from '../db/list-repositories.ts'

/** Who writes the office's own steps on the supervisor's run: the office itself, as on a next round. */
function theOfficeWritesIt(): Actor { return { type: 'system', id: moleOffice().id } }
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/** Every refusal of this file, so each says what was not done. */
function refused(words: string, status: number): never {
  throw new PanelError(words, status)
}

/**
 * THE GATE `worker-cuts-the-sandbox-cannot-use`, read once where a cut would be refused (wave 13r round N). At block the
 * refusal is thrown and counted as stopped, or, at the start, `refuse` writes the failed ask and throws. At off it is
 * counted and the cut goes on.
 */
function aCutTheSandboxCannotUse(refuse: () => never): void {
  const position = gatePosition('worker-cuts-the-sandbox-cannot-use')
  const met = () => gateMet('worker-cuts-the-sandbox-cannot-use', position!)
  if (position === 'block') {
    try {
      refuse()
    } catch (error) {
      throw error instanceof PanelError ? gateMetOnceTheWriteIsTakenBack(error, met) : error
    }
  }
  met()
}

/** Write one worker's entry as the office, or as the asker for the ask itself. */
function write(run: string, agentId: string, entry: TheWorkerRun, actor: Actor = theOfficeWritesIt()): void {
  writeTheWorkerRun(run, agentId, entry as unknown as Record<string, unknown>, actor)
}

// ================================================================================================== the worker and the asker

/** The worker a path segment names, by id or handle; a retired worker is refused here, by name. */
function theWorkerAskedFor(reference: string, actor: Actor): RegisteredAgent {
  const named = theAgentAnArrivingReferenceNames(reference, 'reading', actor.keyHolder ?? null)
  const row = named === null ? null : readParticipant({ kind: 'agent', id: named.agent.id })
  if (row === null || !('startedBy' in row)) {
    refused(`Mole Office has no agent called "${reference}", so no worker run was asked for. Nothing was written.`, 404)
  }
  if (row.retired === true) {
    refused(`${row.handle} (${row.id}) is retired, so no worker run of it is started. Nothing was written.`, 409)
  }
  return row
}

/**
 * THE SUPERVISOR ASKING, or null when the request is not one: an agent proved by its own key, not acting for another,
 * and the worker's registered starter. A header that names the starter proves nothing, and neither does the person:
 * the decision is that a supervisor starts its own workers, so the starter is the only one who asks here.
 */
function theSupervisorAsking(worker: RegisteredAgent, actor: Actor): RegisteredAgent | null {
  const proved = theAgentTheKeyProves(actor)
  if (actor.type !== 'agent' || actor.provedHolder !== undefined || proved === null || actor.keyHolder === undefined) return null
  if (!theKeyHolderIsTheRegisteredStarterOf(worker, actor.keyHolder)) return null
  const row = readParticipant({ kind: 'agent', id: proved })
  return row !== null && 'startedBy' in row ? row : null
}

/**
 * WHY NO WORKER OF THIS OFFICE WOULD START A WORKER RUN, or null because one would. A worker that takes the queue
 * (`MOLE_OFFICE_MESSAGE_WORKER=on`) starts them, and so does a worker in merges-only mode: `onePass` in
 * src/worker/index.ts tends them in both. With `off` the server starts no worker, so an ask nothing would start is
 * refused rather than kept.
 *
 * WHY MERGES-ONLY MODE STARTS WORKER RUNS. Two decisions. A supervisor starts its own workers,
 * and the office only reminds how many, as option B of a decision says. Merges-only mode
 * exists so that a message to an agent nobody holds does not start a run by itself: the rule is to ask
 * first (criterion M78). A worker run asked through this door has been asked for by the supervisor that starts it, so
 * the mode starts it. It still starts no run for a message, and `off` still starts nothing. This reading for next
 * rounds was decided as engineering, in the brief of round loop-3 (from run ALi7EJl2rpIx); reading it for worker runs
 * too was this round's engineering choice. Both can be undone, and the owner may change them.
 */
function whyNoWorkerWouldStartIt(): string | null {
  const mode = settingValue('MOLE_OFFICE_MESSAGE_WORKER')
  if (mode === 'on' || mode === 'merges-only') return null
  return `The office starts no message worker (MOLE_OFFICE_MESSAGE_WORKER=${String(mode)}), so nothing would start this worker.`
}

/** The supervisor's run the session header names: a running session of the supervisor in this project, or a refusal. */
function theSupervisorsRun(supervisor: RegisteredAgent, actor: Actor, workspaceId: string): PanelRecord {
  const session = text(actor.sessionId)
  const run = session === null ? null : getRecord(session)
  if (
    run === null || run.kind !== 'session' || run.workspaceId !== workspaceId || run.deletedAt !== null ||
    run.data['state'] !== 'running' || theAgentARunServes(run.data)?.id !== supervisor.id
  ) {
    refused(
      `A worker run is asked for from a running run of ${supervisor.handle} in this project, named in x-mole-office-session, ` +
        `and ${session === null ? 'this request named none' : `run ${session} is not one`}. Nothing was written.`,
      409,
    )
  }
  return run
}

/** The same guard for a door ask and a hand start, before either can replace its entry. */
function refuseASecondWorkerRun(worker: RegisteredAgent, workspaceId: string, run: PanelRecord, byHand = false): void {
  const serving = runServing(worker.id, workspaceId)
  if (serving !== null) {
    refused(
      byHand
        ? `Run ${serving} is already serving ${worker.handle}, so wait for it to end before starting it with --asked-by (askedBy) and --brief (brief), or through the worker-run door; nothing was started.`
        : `Run ${serving} is already serving ${worker.handle}, so a worker run would be a second run of it. Ask again when ` +
          'that run has ended. Nothing was written.',
      409,
    )
  }

  // A run is filed before its process is registered, leaving a gap in the live-process reading measured on 22 November 2026.
  // Once a process row exists, leave it to runServing: its comment explains the 4 September case of a stale running record.
  const filed = sqlite.prepare(
    "SELECT id, data FROM records WHERE kind = 'session' AND workspace_id = ? AND deleted_at IS NULL AND json_extract(data, '$.parentAttachment') = ? " +
      "AND (json_extract(data, '$.servingAgentId') IS NOT NULL OR json_extract(data, '$.servingAgent') IS NOT NULL)",
  ).all(workspaceId, run.id) as { id: string; data: string }[]
  for (const row of filed) {
    const data = JSON.parse(row.data) as Record<string, unknown>
    if (theAgentARunServes(data)?.id !== worker.id || theRunHasEnded(data['state'])) continue
    if (listResources({ workspaceId, sessionRecordId: row.id, includeReleased: true }).some(resource => resource.type === 'process')) continue
    refused(
      byHand
        ? `Run ${row.id} was filed for ${worker.handle} under run ${run.id} and has not ended, so wait for it to end before starting it with --asked-by (askedBy) and --brief (brief), or through the worker-run door; nothing was started.`
        : `Run ${row.id} was filed for ${worker.handle} under run ${run.id} and has not ended, so a worker run would be a second run of it. Ask again when that run has ended. Nothing was written.`,
      409,
    )
  }
}

/** A hand ask checked by the office, before the worktree and again inside the run's filing transaction. */
export interface AHandStart {
  run: string
  agentId: string
  entry: TheWorkerRun
  /**
   * What the hand-run door answers the launcher, which files the run at its commit: the ask's cut when the worktree is
   * made now, the commit a worktree that is there stands at, and null for a filing, which answers no launcher.
   */
  answer: { commit: string; named: string | null } | null
}

/**
 * THE ONE RULE FOR A HAND START. Office starts and unmarked agents keep their existing paths. A marked worker
 * needs its starter's own proof, a live asking run by the door's reading, and a brief. Filing may reuse the cut
 * kept at preflight; it never takes an unmeasured cut from the tool as the ask-time fact.
 */
export function theHandStartAskedFor(input: {
  agent: string | null
  askedBy?: string | undefined
  brief?: string | undefined
  cutFrom?: string | undefined
  worktree?: string | undefined
  workspaceId: string
  actor: Actor
  filing?: boolean
}): AHandStart | null {
  if (input.filing === true && input.askedBy === undefined && (input.brief !== undefined || input.cutFrom !== undefined)) {
    refused('brief and cutFrom describe a hand ask, so send them with a valid --asked-by (askedBy) or omit them from this filing; nothing was written.', 400)
  }
  const named = input.actor.provedBy === 'the-office-key' || input.agent === null
    ? null : theAgentAnArrivingReferenceNames(input.agent, 'reading', input.actor.keyHolder ?? null)
  if (named === null || !thisAgentWasRegisteredWithNoKeyOfItsOwn(named.agent.id)) {
    if (input.askedBy !== undefined) refused('--asked-by (askedBy) applies only to a hand start of a worker with no key of its own, so omit it for this start; nothing was written.', 400)
    return null
  }
  const worker = theWorkerAskedFor(named.agent.id, input.actor)
  const sentence = 'This worker has no key of its own, so start it with --asked-by (askedBy) naming a live run of its registered starter and --brief (brief) naming its brief, or use the worker-run door; nothing was started.'
  const supervisor = theSupervisorAsking(worker, input.actor)
  if (supervisor === null || text(input.askedBy) === null || text(input.brief) === null) refused(sentence, 403)
  let run: PanelRecord
  try {
    run = theSupervisorsRun(supervisor, { ...input.actor, sessionId: input.askedBy! }, input.workspaceId)
  } catch (error) {
    if (!(error instanceof PanelError)) throw error
    refused(sentence, 403)
  }
  refuseASecondWorkerRun(worker, input.workspaceId, run, true)
  const sandbox = theSandboxTheOfficeVouchesFor(run)
  if (sandbox === null) throw aRefusalForAnUnvouchedSandbox(run.data, new PanelError(sentence, 403))
  const brief = theBriefAt(input.brief!, sandbox.folder)
  const worktree = input.worktree ?? theWorkersOwnWorktree(sandbox.folder, worker.handle)
  const pathSentence = `A hand start's worktree must be an absolute path inside ${sandbox.folder}, so choose a worktree inside that sandbox; nothing was started.`
  if (!isAbsolute(worktree)) refused(pathSentence, 400)
  let realWorktree: string
  let realSandbox: string
  try {
    realWorktree = theRealLocation(resolve(worktree))
    realSandbox = theRealLocation(sandbox.folder)
  } catch {
    refused(pathSentence, 409)
  }
  if (realWorktree !== realSandbox && !realWorktree.startsWith(realSandbox + sep)) refused(pathSentence, 403)
  const before = theWorkerRunOf(sqlite, run.data, worker.id)
  if (input.filing === true && before?.byHand === true && before.state === 'starting' && before.cut !== undefined &&
      before.askedBy.session === run.id && before.askedBy.who.id === supervisor.id &&
      before.brief.path === brief.path && before.brief.sha256 === brief.sha256 && (input.cutFrom === undefined || before.cut.named === input.cutFrom || before.cut.commit === input.cutFrom)) {
    return { run: run.id, agentId: worker.id, entry: before, answer: null }
  }
  const cut = theCutTheAskChooses(run, sandbox.folder, input.cutFrom)
  const there = theWorktreeThere(sandbox.folder, worker.handle, realWorktree)
  // A WORKTREE THAT IS THERE IS USED AS IT STANDS, AND THE RUN IS FILED AT THE COMMIT IT STANDS AT, so the launcher is
  // answered that commit and not the ask's. One whose HEAD git cannot read stands at no commit the office can name, so
  // that start is refused rather than filed at another commit.
  const reused = input.filing === true || there === null
    ? null : { there, head: there.head ?? refused(aHeadNobodyCanRead(there, 'hand start'), 409) }
  if (input.filing !== true && there !== null && cut.named !== null) aCutTheSandboxCannotUse(() => refused(`The worker's worktree ${isThere(there)}, so remove it with node tools/remove-a-worktree.mjs ${there.dir} before asking for --cut-from; nothing was started.`, 409))
  const cutSays = input.filing === true
    ? there === null ? 'The hand filing recorded no readable existing worktree, so no worktree creation was recorded.' : `The hand filing uses the worker's worktree ${isThere(there)} as it stands.`
    : reused === null
    ? `The hand start was given --cut-from ${cut.commit} to make its worktree at ${theCutInWords(cut, run.id)}.`
    : aHandStartUsesAWorktreeThatIsThere(reused.there, reused.head, cut)
  return {
    run: run.id,
    agentId: worker.id,
    entry: {
      state: 'starting', byHand: true, askedAt: nowStamp(),
      askedBy: { who: { kind: 'agent', id: supervisor.id }, session: run.id },
      handle: worker.handle, brief, sandbox, cut,
      starting: { at: nowStamp(), cutFrom: input.filing !== true && there === null ? cut.commit : null, cutSays },
    },
    answer: input.filing === true ? null : reused === null ? cut : { commit: reused.head, named: null },
  }
}

/** Keep a valid hand ask directly as starting, so the message worker never takes it as work to launch. */
export function keepTheHandStart(ask: AHandStart): void {
  write(ask.run, ask.agentId, ask.entry)
}

// ================================================================================================== the row

/** "a, b and c", or the one word alone. */
const inAList = (words: string[], last: 'and' | 'or'): string => (words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} ${last} ${words.at(-1)!}`)

/** Whether the launcher has a command for a program, so a worker can be started on it. */
const theLauncherStarts = (program: string | null): program is AChosenRuntime => program !== null && Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, program)

/** Why the launcher cannot start a worker on a row's program, in words. */
const theLauncherCannotStart = (id: number, program: string, model: string): string =>
  `Row ${String(id)} casts "${program}" with the model "${model}", and the launcher starts a worker only on ` +
  `${inAList(Object.keys(THE_PROGRAM_A_RUNTIME_RUNS), 'or')}.`

/** The worker rows a choice was checked against, in words, as a refusal names them. */
function theRowsReadInWords(rows: CastingRow[], project: string): string {
  if (rows.length === 0) return `No row was read: the Casting table marks no worker row for project ${project} or for every project.`
  const read = rows.map((row) => `${String(row.id)} (${row.cells.program.value ?? 'no program'} with ${row.cells.model.value ?? 'no model'})`)
  return read.length === 1 ? `The row read was ${read[0]!}.` : `The rows read were ${inAList(read, 'and')}.`
}

/**
 * WHETHER A KEPT ROLL STARTS ON THE ROW'S CELLS INSTEAD OF THE ROLL'S OWN START RULE: a native row is held to its
 * selection, and a row that changed after the draw is read again by the later ask. A row that did not change keeps
 * the rule the roll itself answered with, such as the marked OpenCode Luna row that starts on Codex. The ask and the
 * start read this one rule, so they cannot name different runtimes or models for one kept roll.
 */
function theKeptRollUsesTheRowsCells(roll: CastingRollRecord, kept: TheRowAWorkerIsGiven): boolean {
  const rolled = roll.selected
  return kept.revision !== null || (rolled !== null && (rolled.program !== kept.program || rolled.model !== kept.model))
}

/** Why a row cannot be reused while its stored Out until is still to come. */
function whyTheWorkerRowIsOut(row: CastingRow): string | null {
  const value = row.cells.out_until.value
  const instant = readCastingOutUntil(value, `Casting row ${String(row.id)}`)
  return value !== null && instant !== null && instant > Date.now() ? `Casting row ${String(row.id)} is out until ${value}.` : null
}

/**
 * The Casting row one roll of the default router (lib/casting-roll.ts) chose for the worker card, read from the table,
 * when the launcher can start it and it is not held; or why not. The ask rolls and keeps the record on its entry with
 * the row as it read it, and the start reads that row again and does not roll (round 46), so the ask and the start give
 * one row by one rule.
 */
function theWorkerCard(
  roll: CastingRollRecord,
  marked: TheDifficultyMarked | null = null,
): { ok: true; row: TheRowAWorkerIsGiven; program: AChosenRuntime; model: string; says: string; roll: CastingRollRecord } | { ok: false; says: string } {
  const start = theStartOfARoll(roll)
  if (start.runtime === null || start.model === null || start.rowId === null) return { ok: false, says: roll.says }
  const row = aCastingById(start.rowId)
  const held = theHoldOn(row)
  if (held !== null) return { ok: false, says: held }
  const out = whyTheWorkerRowIsOut(row)
  if (out !== null) return { ok: false, says: out }
  // THE MARKED LABEL. A kept roll, and the marked row a roll takes when no row of the label has a probability above 0,
  // may give a row that does not carry the label the brief marks, and the roll answers it all the same, so the row's own
  // cell is read here.
  const carries = marked === null ? [] : theLabelNamesOf(row)
  const inIt = marked === null ? '' : theDifficultyTheBriefMarks(marked, row.id, carries)
  if (marked !== null && !carries.includes(marked.label)) return { ok: false, says: `${roll.says} ${inIt} ${A_WORKER_IS_GIVEN_A_ROW_OF_ITS_LABEL}` }
  const kept = theRowAsTheAskReadIt(row)
  const named = theKeptRollUsesTheRowsCells(roll, kept) ? { runtime: kept.program, model: kept.model } : { runtime: start.runtime, model: start.model }
  if (!theLauncherStarts(named.runtime)) return { ok: false, says: `${roll.says} ${theLauncherCannotStart(row.id, named.runtime, named.model)}` }
  const limited = theLimitsOn(named.runtime, named.model, theLimitsNow(Date.now()))
  if (limited.length > 0) return { ok: false, says: `Casting row ${String(row.id)} cannot be taken: ${limited.join(' ')}` }
  return { ok: true, row: kept, program: named.runtime, model: named.model, says: marked === null ? roll.says : `${roll.says} ${inIt}`, roll }
}

/** The names of the labels a Casting row carries, as the table holds them now. */
function theLabelNamesOf(row: CastingRow): string[] {
  const names = theCastingLabelNames()
  return readCastingLabelIds(row.cells.labels.value, `Casting row ${String(row.id)}`).map((id) => {
    const name = names.get(id)
    if (name === undefined) throw new Error(`Casting row ${String(row.id)} carries the label ${String(id)}, which the table does not hold.`)
    return name
  })
}

/** The Casting label a brief marks, and the line it is marked on. */
export interface TheDifficultyMarked { label: string; line: number }

/** What the answer says of the difficulty a brief marks, beside the labels of the row the worker is given. */
export const theDifficultyTheBriefMarks = (marked: TheDifficultyMarked, row: number, labels: readonly string[]): string =>
  `The brief marks its difficulty ${marked.label} on line ${String(marked.line)}, and row ${String(row)} ` +
  `${labels.length === 0 ? 'carries no label' : `carries ${labels.join(', ')}`}.`

/** Why a row that does not carry the label its brief marks is refused, and the way out. */
export const A_WORKER_IS_GIVEN_A_ROW_OF_ITS_LABEL = 'A worker is given a row that carries the label its brief marks. Name a runtime and a model to choose its row.'

/** The refusal of a brief that marks its difficulty with a word that is no label of the Casting table. */
export const aDifficultyThatIsNoLabel = (path: string, word: string, line: number, labels: readonly string[]): string =>
  `The brief ${path} marks its difficulty "${word}" on line ${String(line)}, and that is not a label of the Casting table. ` +
  `${labels.length === 0 ? 'The table holds no label.' : `Its labels are ${labels.join(', ')}.`} Mark it with a line of its own, ` +
  '"Difficulty: " and a label, or leave the line out to have the roll draw among every row. Nothing was written.'

/** The refusal of a brief that marks a label by a name it had before it was renamed. */
export const aDifficultyThatWasRenamed = (path: string, word: string, line: number, now: string): string =>
  `The brief ${path} marks its difficulty "${word}" on line ${String(line)}, and that label is called ${now} now. ` +
  `Mark it "Difficulty: ${now}". Nothing was written.`

/** The refusal of a brief that marks two labels. */
export const aDifficultyMarkedTwice = (path: string, first: TheDifficultyMarked, second: TheDifficultyMarked): string =>
  `The brief ${path} marks its difficulty twice, ${first.label} on line ${String(first.line)} and ${second.label} on line ${String(second.line)}. Keep one line. Nothing was written.`

/**
 * THE DIFFICULTY A BRIEF MARKS, from a line of its own that begins "Difficulty:", or null when no line does. The line's
 * name and the word after it are read in any letter case and without the spaces around the word, and the word is read
 * as a label by readACastingLabelWord (src/server/lib/casting-labels.ts). It must be a label the Casting table holds:
 * the old name of a renamed label is refused naming its name now, and a brief that marks two labels is refused, so no
 * guess is made of which it meant.
 */
function theDifficultyMarkedIn(words: string, path: string): TheDifficultyMarked | null {
  let found: TheDifficultyMarked | null = null
  for (const [index, line] of words.split('\n').entries()) {
    const mark = /^\s*difficulty:(.*)$/i.exec(line)
    if (mark === null) continue
    const word = mark[1]!.trim()
    const read = readACastingLabelWord(word)
    if (read.is === 'no label') refused(aDifficultyThatIsNoLabel(path, word, index + 1, read.labels), 400)
    if (read.is === 'renamed') refused(aDifficultyThatWasRenamed(path, word, index + 1, read.now), 400)
    const label = read.name
    if (found !== null && found.label !== label) refused(aDifficultyMarkedTwice(path, found, { label, line: index + 1 }), 400)
    found ??= { label, line: index + 1 }
  }
  return found
}

// ================================================================================================== the choice

/** What a refusal of a choice ends with: what naming neither gives. */
const WITH_NEITHER = 'With neither named, the worker is given the Casting row for the worker card. Nothing was written.'

/**
 * The runtime and the model an ask names, with the one Casting row that casts them, or null because it names neither.
 * The rows are the worker card's in force for the project, the rows a roll chooses among. A row casts a choice when its
 * program is the runtime and the model names it by the one name rule (aNameNamesTheSelection). A choice no row casts or
 * two rows cast, a row the launcher cannot start, and a held row are refused here.
 */
function theChoiceAsked(
  runtime: string | undefined,
  model: string | undefined,
  project: string,
  handle: string,
): { runtime: AChosenRuntime; model: string; row: TheRowAWorkerIsGiven } | null {
  if (runtime === undefined && model === undefined) return null
  const rows = [...theRowsInForce(THE_WORKER, project)].sort((one, two) => one.id - two.id)
  if (runtime === undefined || model === undefined) {
    const named = runtime === undefined ? `the model "${String(model)}" and no runtime` : `the runtime "${runtime}" and no model`
    refused(`Name the runtime and the model together, or neither, and this ask named ${named}. ${theRowsReadInWords(rows, project)} ${WITH_NEITHER}`, 400)
  }
  const casting = rows.filter((row) => row.cells.program.value === runtime && aNameNamesTheSelection(model, { runtime, model: row.cells.model.value, native: row.native ?? null }))
  if (casting.length === 0) {
    refused(
      `No Casting row of the worker card in force for project ${project} casts "${runtime}" with the model "${model}", so a supervisor may not ` +
        `choose it for a worker. ${theRowsReadInWords(rows, project)} ${WITH_NEITHER}`,
      400,
    )
  }
  if (casting.length > 1) {
    refused(
      `Rows ${inAList(casting.map((row) => String(row.id)), 'and')} of the worker card in force for project ${project} each cast "${runtime}" with ` +
        `the model "${model}", so the choice names no one row. Nothing was written.`,
      400,
    )
  }
  const row = casting[0]!
  if (!theLauncherStarts(runtime)) refused(`${theLauncherCannotStart(row.id, runtime, row.cells.model.value!)} Nothing was written.`, 400)
  const held = theHoldOn(row)
  if (held !== null) refused(noWorkerRunCouldBeStarted(held, handle), 409)
  return { runtime, model, row: theRowAsTheAskReadIt(row) }
}

/** The launcher's command for a chosen runtime: `worker` takes claude-code and codex only, so dsh and OpenCode go through `exec --agent`. */
function theLaunchersCommandFor(runtime: AChosenRuntime): 'worker' | 'exec' {
  return runtime === 'dsh' || runtime === 'opencode' ? 'exec' : 'worker'
}

/** The worktree a dsh or OpenCode worker is given, its own, as `worker` makes for the others: without one it would run in the sandbox's repo/. */
const theWorkersOwnWorktree = (folder: string, handle: string): string => join(folder, 'worktrees', handle)

// ================================================================================================== the cut

/** One line git answered, or why it did not answer. */
function aGitLine(directory: string, args: string[]): { ok: true; line: string } | { ok: false; says: string } {
  try {
    return { ok: true, line: readGit(directory, args, { timeoutMs: 15_000 }).toString('utf8').trim() }
  } catch (error) {
    return { ok: false, says: whyGitDidNotAnswer(error) }
  }
}

/** What git answered for a name that resolves to no commit, as against git that could not answer. */
const NO_SUCH_COMMIT = 'git resolves it to no commit'

/** The commit a name resolves to in a checkout, or why it does not resolve to one. */
function theCommitOf(directory: string, name: string): { ok: true; line: string } | { ok: false; says: string } {
  try {
    const line = readGit(directory, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${name}^{commit}`], { timeoutMs: 15_000 }).toString('utf8').trim()
    return line === '' ? { ok: false, says: 'git answered no commit' } : { ok: true, line }
  } catch (error) {
    // `--verify --quiet` exits 1 and says nothing when the name resolves to no commit.
    const failed = error as { status?: unknown; stderr?: unknown }
    return { ok: false, says: failed.status === 1 && String(failed.stderr ?? '').trim() === '' ? NO_SUCH_COMMIT : whyGitDidNotAnswer(error) }
  }
}

export class OutsidePlaceRequired extends PanelError {}
const PASS_ON_THE_SAFETY_LINE = 'The line in forThePerson is for the person: pass it on to them when the place is chosen.'

/** Read and validate a place without making a folder, worktree or branch. */
function thePlaceAsked(asked: TheWorkerPlaceAsked, cutFrom: string | undefined, workspaceId: string, handle: string): { place: TheWorkerPlace; cut: NonNullable<TheWorkerRun['cut']> } {
  const folder = asked.folder
  if (!isAbsolute(folder)) refused(`The folder ${folder} must be an absolute path. Nothing was written.`, 400)
  const repositories = listRepositories(workspaceId)
  if (asked.kind === 'worktree') {
    const repo = repositories.find((one) => one.name === asked.repository)
    if (repo === undefined || repo.root === null) refused(`The repository ${asked.repository} is not registered with a root in this project. Nothing was written.`, 400)
    if (lstatSync(folder, { throwIfNoEntry: false }) !== undefined) refused(`The worktree folder ${folder} already exists. Nothing was written.`, 409)
    try { if (!statSync(dirname(folder)).isDirectory()) refused(`The parent of ${folder} is not a folder. Nothing was written.`, 409) }
    catch (error) { if (error instanceof PanelError) throw error; refused(`The parent of ${folder} does not exist as a folder. Nothing was written.`, 409) }
    if (cutFrom === undefined || cutFrom.startsWith('-')) refused('A worktree place needs cutFrom naming a commit, and cutFrom must not begin with "-". Nothing was written.', 400)
    const commit = theCommitOf(repo.root, cutFrom)
    if (!commit.ok) refused(`cutFrom ${cutFrom} does not name a readable commit in the repository: ${commit.says}. Nothing was written.`, 400)
    const branch = aGitLine(repo.root, ['for-each-ref', '--format=%(refname)', `refs/heads/${handle}`])
    if (!branch.ok) refused(`Git could not read the worker branch: ${branch.says}. Nothing was written.`, 409)
    if (branch.line.split('\n').includes(`refs/heads/${handle}`)) refused('The worker branch already exists in the repository. Nothing was written.', 409)
    return { place: { kind: 'worktree', folder, repository: { name: repo.name, root: repo.root } }, cut: { named: cutFrom, commit: commit.line } }
  }
  if (cutFrom !== undefined) refused('A folder place is used as it stands, so it takes no cutFrom. Nothing was written.', 400)
  let real: string
  try { if (!statSync(folder).isDirectory()) throw new Error(); real = realpathSync(folder) }
  catch { refused(`The folder ${folder} does not exist as a folder. Nothing was written.`, 409) }
  const top = aGitLine(folder, ['rev-parse', '--show-toplevel'])
  let realTop: string | null = null
  try { if (top.ok) realTop = realpathSync(top.line) } catch { /* Git's answer is not a readable path. */ }
  if (realTop !== real) refused(`The folder ${folder} is not the top of a git work tree. Nothing was written.`, 409)
  const head = theCommitOf(folder, 'HEAD')
  if (!head.ok) refused(`Git cannot read a commit at HEAD in ${folder}: ${head.says}. Nothing was written.`, 409)
  const repo = repositories.find((one) => { try { return one.root !== null && realpathSync(one.root) === real } catch { return false } })
  return { place: { kind: 'folder', folder, repository: repo?.root == null ? null : { name: repo.name, root: repo.root } }, cut: { named: null, commit: head.line } }
}

/** The clones `<sandbox>/instance.json` lists, by name, as `up` records them, or why the file could not be read. */
function theClonesListed(folder: string): { ok: true; file: string; names: string[] } | { ok: false; file: string; says: string } {
  const file = join(folder, 'instance.json')
  try {
    const instance = JSON.parse(readFileSync(file, 'utf8')) as unknown
    const clones = isObject(instance) && Array.isArray(instance['clones']) ? (instance['clones'] as unknown[]) : []
    return { ok: true, file, names: clones.flatMap((clone) => (isObject(clone) && text(clone['name']) !== null ? [clone['name'] as string] : [])) }
  } catch (error) {
    return { ok: false, file, says: error instanceof Error ? error.message : String(error) }
  }
}

/** With no clone named, the sentence that names the sandbox's clones, or nothing when it lists none or one is named. */
function theClonesToName(folder: string, clone: string | undefined): string {
  const listed = clone === undefined ? theClonesListed(folder) : null
  return listed?.ok === true && listed.names.length > 0 ? ` The sandbox's clones are ${listed.names.join(', ')}: to cut from one, name it as clone.` : ''
}

/**
 * THE CLONE THE ASK NAMES, by the name instance.json lists it under, or a refusal. Its folder name, or its absolute path
 * directly in the sandbox. A clone it does not list is refused, and so is a listed one whose folder leads outside the
 * sandbox, because a run in the sandbox can write instance.json.
 */
function theCloneAsked(folder: string, asked: string): string {
  const refuse = (words: string): never => {
    throw new PanelError(`clone "${asked}" ${words} Nothing was written.`, 400, undefined, undefined, undefined, { code: 'workerCloneNotOfTheSandbox', values: {} })
  }
  const byPath = asked.includes('/')
  if (byPath && (!isAbsolute(asked) || dirname(resolve(asked)) !== folder)) {
    refuse(`is not a folder of the sandbox ${folder}. Name one of its clones by its folder name beside repo/, or by its absolute path there.`)
  }
  const name = byPath ? basename(resolve(asked)) : asked
  const listed = theClonesListed(folder)
  if (!listed.ok) return refuse(`could not be checked, because ${listed.file} could not be read: ${listed.says}.`)
  if (!listed.names.includes(name)) {
    refuse(`is not one of the sandbox's clones, which ${listed.file} lists${listed.names.length === 0 ? ' none.' : `: ${listed.names.join(', ')}.`}`)
  }
  const dir = join(folder, name)
  let real: string
  try {
    real = realpathSync(dir)
  } catch {
    return refuse(`is listed in ${listed.file}, but ${dir} is not there.`)
  }
  if (dirname(real) !== realpathSync(folder)) refuse(`is ${dir}, which leads to ${real}, outside the sandbox ${folder}.`)
  return name
}

/** The real path of the common git directory of the repository a folder belongs to, or null when git cannot say. */
function theCommonGitDirectoryOf(directory: string): string | null {
  const read = aGitLine(directory, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (!read.ok || read.line === '') return null
  try {
    return realpathSync(read.line)
  } catch {
    return null
  }
}

/** Why a repository is none of the sandbox's clones: the clones `listed.file` lists, that it lists none, or why it could not be read. */
export function isNotOneOfTheClones(listed: { ok: true; file: string; names: readonly string[] } | { ok: false; file: string; says: string }): string {
  return (
    `is not one of the clones ${listed.file} lists` +
    (!listed.ok ? `, and ${listed.file} could not be read: ${listed.says}` : listed.names.length === 0 ? ', and it lists none' : `: ${listed.names.join(', ')}`)
  )
}

/**
 * The refusal of a run that names no cutFrom and no clone, whose worktree `directory` stands at `commit`, when that
 * worktree's repository `repository` is none of the sandbox's clones, as `notListed` says, and `repo` does not hold the commit.
 */
export function aRunOfAnotherRepositoryIsRefused(run: string, commit: string, directory: string, repository: string, notListed: string, repo: string): string {
  return (
    `Run ${run} named no cutFrom and no clone, so the worker would be cut from ${commit}, the commit its worktree ` +
    `${directory} stands at. That worktree belongs to the repository ${repository}, which ${notListed}, ` +
    `and ${repo} does not hold the commit. Name a branch or commit of the sandbox's repository as cutFrom, or name a clone. Nothing was written.`
  )
}

/**
 * THE CLONE A RUN THAT NAMES NO CLONE AND NO CUTFROM STANDS IN, by the repository its worktree belongs to: a clone
 * instance.json lists, checked as a named clone is; or that repository, when it is none of them, with the clones the
 * file lists in words; or null when the run names no workingDirectory or git cannot say which repository it belongs
 * to. A run of another repository is looked for in repo/ as before, because a commit id names the same tree wherever
 * it is found, and is refused in words naming its repository only when repo/ does not hold the commit.
 */
function theCloneTheRunStandsIn(run: PanelRecord, folder: string): { clone: string; dir: string } | { repository: string; dir: string; notListed: string } | null {
  const dir = text(run.data['workingDirectory'])
  const own = dir === null ? null : theCommonGitDirectoryOf(dir)
  if (dir === null || own === null) return null
  const listed = theClonesListed(folder)
  const clone = listed.ok ? listed.names.find((name) => theCommonGitDirectoryOf(join(folder, name)) === own) : undefined
  if (clone !== undefined) return { clone: theCloneAsked(folder, clone), dir }
  return {
    repository: basename(own) === '.git' ? dirname(own) : own,
    dir,
    notListed: isNotOneOfTheClones(listed),
  }
}

/**
 * THE COMMIT THE ASK CUTS ITS WORKER FROM, or a refusal. A `cutFrom` the ask names, a branch or a commit, is resolved in
 * the sandbox's repository, or in the clone the ask named and only there. With none, the commit the asking run's own
 * worktree stands at is read now, from its `workingDirectory`. Either is refused unless a branch or tag of that
 * repository reaches it, or the gate `worker-cuts-the-sandbox-cannot-use` is off. One git cannot check is refused at
 * both positions.
 */
function theCutTheAskChooses(
  run: PanelRecord, folder: string, named: string | undefined, clone?: string, elsewhere?: { repository: string; notListed: string },
): NonNullable<TheWorkerRun['cut']> {
  const repo = join(folder, clone ?? 'repo')
  const where = clone === undefined ? `the sandbox's repository ${repo}` : `the sandbox's clone ${repo}`
  let commit: string
  let chosen: string
  if (named === undefined) {
    const directory = text(run.data['workingDirectory'])
    const head = directory === null ? null : theCommitOf(directory, 'HEAD')
    if (head === null || !head.ok) {
      throw new PanelError(
        `Run ${run.id} named no cutFrom, so the worker would be cut from the commit the run's own worktree stands at, and ` +
          (head === null ? 'the run names no workingDirectory.' : `git could not read HEAD in ${String(directory)}: ${head.says}.`) +
          ` Name a branch or commit of ${clone === undefined ? "the sandbox's repository" : where} as cutFrom. Nothing was written.`,
        409, undefined, undefined, undefined, { code: 'workerCutHeadUnread', values: {} },
      )
    }
    commit = head.line
    chosen = `Run ${run.id} named no cutFrom, so the worker would be cut from ${commit}, the commit its worktree ${String(directory)} stands at`
    // A RUN OF A REPOSITORY THAT IS NEITHER A LISTED CLONE NOR HOLDS ITS COMMIT IN REPO/ is refused in words naming it.
    const held = elsewhere === undefined ? null : theCommitOf(repo, commit)
    if (elsewhere !== undefined && held !== null && !held.ok && held.says === NO_SUCH_COMMIT) {
      throw new PanelError(
        aRunOfAnotherRepositoryIsRefused(run.id, commit, String(directory), elsewhere.repository, elsewhere.notListed, repo),
        409, undefined, undefined, undefined, { code: 'workerCutNotInTheSandbox', values: {} },
      )
    }
  } else {
    const resolved = named.startsWith('-') ? null : theCommitOf(repo, named)
    if (resolved === null || !resolved.ok) {
      // WITH NO CLONE NAMED, the refusal names the sandbox's clones, because cutFrom is never looked for in one unasked.
      const clones = theClonesToName(folder, clone)
      throw new PanelError(
        `cutFrom "${named}" is not a branch or commit of ${where}: ` +
          `${resolved === null ? 'a branch or commit does not begin with "-"' : resolved.says}.${clones} Nothing was written.`,
        400, undefined, undefined, undefined, { code: 'workerCutNotInTheSandbox', values: {} },
      )
    }
    commit = resolved.line
    chosen = `cutFrom "${named}" names the commit ${commit}`
  }
  const reached = aGitLine(repo, ['for-each-ref', '--contains', commit, '--count=1', '--format=%(refname)', 'refs/heads', 'refs/tags'])
  const unreached = (): never => {
    // A COMMIT THE SANDBOX'S REPOSITORY DOES NOT HOLD, with no clone named, is said to be missing there, with the sandbox's
    // clones, because a run working in a clone's worktree that names no clone would be cut from the clone's commit.
    const clones = theClonesToName(folder, clone)
    const held = clones === '' ? null : theCommitOf(repo, commit)
    const missing = held !== null && !held.ok && held.says === NO_SUCH_COMMIT ? ` The commit is not in ${where}.${clones}` : ''
    throw new PanelError(
      `${chosen}, and ` +
        (reached.ok ? `no branch or tag of ${where} reaches it` : `git could not say whether a branch or tag of ${where} reaches it: ${reached.says}`) +
        `. A worker's worktree is made from that repository, so it is cut only from a commit a branch or tag there reaches.${missing} Nothing was written.`,
      named === undefined ? 409 : 400, undefined, undefined, undefined, { code: 'workerCutNotInTheSandbox', values: {} },
    )
  }
  // A commit git cannot check is refused at both positions. Only one no branch or tag reaches is the gate's.
  if (!reached.ok) return unreached()
  if (reached.line === '') aCutTheSandboxCannotUse(unreached)
  return { commit, named: named ?? null, ...(clone === undefined ? {} : { clone }) }
}

/** The worker's own worktree as it stands, or null because nothing is there. */
function theWorktreeThere(folder: string, handle: string, directory?: string): { dir: string; branch: string | null; head: string | null } | null {
  const dir = directory ?? theWorkersOwnWorktree(folder, handle)
  if (!existsSync(dir)) return null
  const branch = aGitLine(dir, ['symbolic-ref', '--short', '-q', 'HEAD'])
  const head = theCommitOf(dir, 'HEAD')
  return { dir, branch: branch.ok && branch.line !== '' ? branch.line : null, head: head.ok ? head.line : null }
}

/** "<folder> is there already, on branch <b>, at <commit>", for a worktree that is there. */
const isThere = (there: { dir: string; branch: string | null; head: string | null }): string =>
  `${there.dir} is there already, ${there.branch === null ? 'on no branch git could read' : `on branch ${there.branch}`}, ` +
  `${there.head === null ? 'at a commit git could not read' : `at ${there.head}`}`

/** What the asker does next after a worktree whose HEAD git cannot read, and what was not done, at each door. */
const AFTER_A_HEAD_NOBODY_CAN_READ = {
  ask: 'and ask again; nothing was written.',
  start: 'and ask again.',
  'hand start': 'and ask again; nothing was started.',
} as const

/**
 * WHY A WORKTREE WHOSE HEAD GIT CANNOT READ IS NOT STARTED IN: a worktree that is there is used as it stands and the run
 * is filed at the commit it stands at, and this one stands at no commit the office can name. `door` is the door that
 * refused it, the ask, the start or the hand start, and the words end with what the asker does next there.
 */
export const aHeadNobodyCanRead = (there: { dir: string; branch: string | null; head: string | null }, door: keyof typeof AFTER_A_HEAD_NOBODY_CAN_READ): string =>
  `The worker's worktree ${isThere(there)}, so the office cannot say which commit the worker's run would be filed at, and it ` +
  `puts no other commit in its place. Remove it with node tools/remove-a-worktree.mjs ${there.dir}, or mend it so that git ` +
  `can read its HEAD, ${AFTER_A_HEAD_NOBODY_CAN_READ[door]}`

/** Where the run of a worker whose worktree is there is filed: at `head`, the commit the worktree stands at. */
export const theRunIsFiledWhereTheWorktreeStands = (head: string): string =>
  `Its run is filed at ${head}, the commit the worktree stands at, because nothing is cut.`

/**
 * What a hand start records of a worktree that is there at `head`: it is used as it stands, and the run is filed at
 * `head`. Where the ask named a cut, the commit it named was not used.
 */
export const aHandStartUsesAWorktreeThatIsThere = (
  there: { dir: string; branch: string | null; head: string | null }, head: string, cut: { commit: string; named: string | null },
): string =>
  `The hand start uses the worker's worktree ${isThere(there)} as it stands. ${theRunIsFiledWhereTheWorktreeStands(head)}` +
  (cut.named === null ? '' : ` The commit it named, ${cut.commit}, was not used.`)

/**
 * What the start records of a worktree that is there at `head`: the worker works in it as it stands, the launcher is
 * given --cut-from `head` so that the run is filed there, and `asked`, the commit the ask chose, is not used.
 */
export const aStartUsesAWorktreeThatIsThere = (there: { dir: string; branch: string | null; head: string | null }, head: string, asked: string): string =>
  `The worker's worktree ${isThere(there)}, so the worker works in it as it stands. The launcher was given --cut-from ` +
  `${head}, the commit the worktree stands at, so that the run is filed at that commit; nothing is cut. The commit the ` +
  `ask chose, ${asked}, was not used.`

/** The rule an image is checked by, in words, after a refusal says why one is not a file. */
export const AN_IMAGE_IS =
  "An image is a file of the worker's worktree, named by a plain path under it, and the launcher gives codex exec each one as -i."

/** The cut `commit`, in words, as the place an image is looked for when the worker's worktree is not there yet. */
export function theCommitOfTheCut(commit: string): string {
  return `${commit}, the commit the worker's worktree is to be cut from`
}

/** The commit `head` the worker's worktree `dir` stands at, in words, as the place an image under one of the ask's paths is looked for. */
export function theCommitTheWorktreeStandsAt(head: string | null, dir: string): string {
  return `${String(head)}, the commit the worker's worktree ${dir} stands at, where the ask's paths are checked out at the start`
}

/** The refusal of `image`, which is not a file of the worker's worktree `dir` on disk, for the reason `why`. */
export function imagesNotInTheWorktree(image: string, dir: string, why: string): string {
  return `images names ${image}, which is not a file of the worker's worktree ${dir}: ${why}. ${AN_IMAGE_IS}`
}

/** The refusal of `image`, which is not a file in the commit `where` names, for the reason `why`. */
export function imagesNotInTheCommit(image: string, where: string, why: string): string {
  return `images names ${image}, which is not a file in ${where}: ${why}. ${AN_IMAGE_IS}`
}

/**
 * WHY AN IMAGE THE ASK NAMED IS NOT A FILE OF THE WORKER'S WORKTREE, or null because each one is. A worktree that is
 * there is read on disk, by the rule the launcher checks with (src/config/a-workers-images.mjs). One that is not there yet
 * is made at the cut, so each image is looked for in that commit, in the sandbox's repository or the clone the ask named,
 * and must be a file there, not a link. An image under one of the ask's paths that a worktree that is there does not
 * hold is looked for in the commit the worktree stands at, because the launcher checks those paths out in it first.
 */
function whyAnImageIsNotThere(
  images: string[],
  paths: string[],
  there: { dir: string; head: string | null } | null,
  folder: string,
  cut: NonNullable<TheWorkerRun['cut']>,
): string | null {
  for (const image of images) {
    let repo = join(folder, cut.clone ?? 'repo')
    let commit: string | null = cut.commit
    let where = theCommitOfTheCut(cut.commit)
    if (there !== null) {
      const onDisk = whyNotAFileOfTheWorktree(there.dir, image)
      if (onDisk === null) continue
      const broughtBack = paths.some((path) => image === path || image.startsWith(`${path}/`))
      if (!onDisk.nothingThere || !broughtBack) return imagesNotInTheWorktree(image, there.dir, onDisk.why)
      repo = there.dir
      commit = there.head
      where = theCommitTheWorktreeStandsAt(there.head, there.dir)
    }
    if (commit === null) return `images names ${image}, under one of the ask's paths, and git could not read the commit the worker's worktree stands at. ${AN_IMAGE_IS}`
    const listed = aGitLine(repo, ['ls-tree', '--full-tree', commit, '--', image])
    const why = !listed.ok
      ? `git could not read it in ${repo}: ${listed.says}`
      : listed.line === ''
        ? NOTHING_IS_THERE
        : listed.line.startsWith('120000 ')
          ? IT_IS_A_LINK
          : listed.line.startsWith('100')
            ? null
            : IT_IS_NOT_A_FILE
    if (why !== null) return imagesNotInTheCommit(image, where, why)
  }
  return null
}

/** The refusal of an ask's images for a worker that would start on `runtime`, which is not codex. */
export function imagesAreOnlyForCodex(runtime: string): string {
  return (
    `images is given only to a codex worker, whose launcher gives codex exec each one as -i, and this worker would start on ${runtime}, ` +
    'which is given no image when it starts. Name the files in the brief for the worker to open, or ask for codex with runtime and model.'
  )
}

/** Why the ask's images are refused for `runtime`, or null because it is codex or the ask named none. */
function whyNoImagesFor(runtime: string, images: string[]): string | null {
  if (images.length === 0 || runtime === 'codex') return null
  return imagesAreOnlyForCodex(runtime)
}

/**
 * What the ask's answer says of its `images`, after its other sentences: nothing when it named none. Each is looked for in
 * the worker's worktree when `worktreeIsThere`, and in the commit it is to be cut from when not.
 */
export function whatTheAskSaysOfItsImages(images: string[], worktreeIsThere: boolean): string {
  return images.length === 0
    ? ''
    : ` The ask names the images ${images.join(', ')}, each a file ` +
        (worktreeIsThere
          ? "in the worker's worktree, or, under one of the ask's paths, in the commit it stands at. "
          : "in the commit the worker's worktree is to be cut from. ") +
        'When the worker starts, the launcher gives codex exec each one as -i, and checks each again once the worktree is ' +
        "made; one that is not a file there fails the start. If the sandbox's template leaves an image's folder out of a " +
        "worker's worktree, name that folder in paths too."
}

/** What the worker's run keeps of the `images` the launcher gave codex exec in the worker's worktree `worktree`. */
export function theImagesGivenSay(images: string[], worktree: string): string {
  const counted = images.length === 1 ? '1 image' : `${String(images.length)} images`
  return `The launcher gave codex exec ${counted} of the worker's worktree ${worktree} as -i: ${images.join(', ')}.`
}

/**
 * The commit the ask chose, in words: "<commit>, which cutFrom "<name>" named" or "<commit>, the commit run <run>'s
 * worktree stood at when it asked", and ", in the sandbox's clone <name>" when the ask named one.
 */
const theCutInWords = (cut: NonNullable<TheWorkerRun['cut']>, run: string): string =>
  (cut.named === null ? `${cut.commit}, the commit run ${run}'s worktree stood at when it asked` : `${cut.commit}, which cutFrom "${cut.named}" named`) +
  (cut.clone === undefined ? '' : `, in the sandbox's clone ${cut.clone}`)

/** What the ask says when it named no clone and run `run`'s worktree `directory` belongs to the sandbox's clone `clone`. */
export const theCommitWasLookedForInTheClone = (run: string, directory: string, clone: string): string =>
  `The ask named no clone, and run ${run}'s worktree ${directory} is a worktree of the sandbox's clone ${clone}, so the commit was looked for in that clone. `

/** What the ask says of the commit the worker's worktree is to be cut from when the worker starts. */
export const theWorktreeIsToBeCutFrom = (cut: NonNullable<TheWorkerRun['cut']>, run: string): string =>
  `When the worker starts, its worktree is to be cut from ${theCutInWords(cut, run)}.`

/** What the start records when the worker's worktree `dir` was not there: what the launcher was given to make it, and from which commit. */
export const aStartCutsTheWorktree = (dir: string, cut: NonNullable<TheWorkerRun['cut']>, run: string): string =>
  `The worker's worktree ${dir} was not there, so the launcher was given ` +
  `${cut.clone === undefined ? '' : `--clone ${cut.clone} `}--cut-from ${cut.commit} to make it at ${theCutInWords(cut, run)}.`

/** What the ask's reply says of the package it named, after its choice of row: nothing when it named none. */
function thePackageSays(work: ThePackageAWorkerWasGiven | null): string {
  if (work === null) return 'The start names no package.'
  const pkg = work.package
  const counted = pkg.points.length === 1 ? '1 point' : `${String(pkg.points.length)} points`
  return `It is given ${counted} of "${work.title}" (${pkg.points.join(', ')}) at ${pkg.difficulty} difficulty, because ${pkg.why}`
}

// ================================================================================================== the ask


// ================================================================================================== the package

/** What a worker start says of the package it was given, with the task's title for its reply. */
interface ThePackageAWorkerWasGiven {
  package: TheWorkerPackage
  title: string
}

/**
 * THE PACKAGE A WORKER START NAMES, with the package's points, the difficulty and why, or null because the start names
 * no package. A start that names a package names all four together:
 *
 *   - the package is a task of this project with a package the office can read, and one made for work inside the
 *     office, because only such a package has points;
 *   - `points` is a non-empty list of the package's own points, each once;
 *   - the difficulty is the ask's, or the one the brief marks when the ask names none, and the two must agree;
 *   - `why` is one sentence saying why this worker was given these points.
 *
 * A start that names none of the four is taken as before and keeps no package. THE CHECK IS BEFORE ANY WRITE, as every
 * check of the ask is, so a refusal leaves the run's `workerRuns` and the worker's own key untouched.
 */
function thePackageAWorkerIsGiven(
  input: { package?: string; points?: string[]; difficulty?: string; why?: string },
  marked: TheDifficultyMarked | null,
  workspaceId: string,
  handle: string,
  askedAt: string,
): ThePackageAWorkerWasGiven | null {
  const named = input.package !== undefined
  if (!named) {
    if (input.points !== undefined || input.difficulty !== undefined || input.why !== undefined) {
      refused(
        `The start of ${handle} names points, a difficulty or a why with no package, and those three describe the package ` +
          'it works on. Name the package too, or name none of the four. Nothing was written.',
        400,
      )
    }
    return null
  }
  const task = recordInWorkspace(input.package!, workspaceId)
  if (task.kind !== 'task') {
    refused(`The start of ${handle} names ${task.id} as its package, and that record is ${withArticle(kindWord(task.kind, 'normal').text)}, not a task. Nothing was written.`, 400)
  }
  const pkg = packageOf(task.data)
  if (pkg === null) {
    refused(
      `The start of ${handle} names "${task.title}" as its package, and that task has no package the office can read. ` +
        'Package it first with POST /api/delegation/<the task>/package, or name no package. Nothing was written.',
      409,
    )
  }
  const points = pkg.pointIds ?? []
  if (points.length === 0) {
    refused(
      `The start of ${handle} names "${task.title}" as its package, and that package is for work outside the office, ` +
        'which carries no points to work on. A worker start names the package\'s points, so package work inside the office ' +
        'for this worker instead. Nothing was written.',
      409,
    )
  }
  const askedPoints = input.points ?? []
  if (askedPoints.length === 0) {
    refused(
      `The start of ${handle} names the package "${task.title}" and no points, and a worker is given the points it ` +
        `works on. The package's points are ${inAList(points, 'and')}. Nothing was written.`,
      400,
    )
  }
  const twice = askedPoints.filter((point, index) => askedPoints.indexOf(point) !== index)
  if (twice.length > 0) {
    refused(`The start of ${handle} names ${inAList([...new Set(twice)], 'and')} twice in its points, and a point is worked once. Nothing was written.`, 400)
  }
  const strangers = askedPoints.filter((point) => !points.includes(point))
  if (strangers.length > 0) {
    refused(
      `The start of ${handle} names ${inAList(strangers, 'and')} as points of "${task.title}", and the package's points ` +
        `are ${inAList(points, 'and')}. A worker is given only the points the package holds. Nothing was written.`,
      400,
    )
  }
  const askedDifficulty = input.difficulty
  const askedLabel = askedDifficulty === undefined ? null : readACastingLabelWord(askedDifficulty)
  if (askedLabel !== null && askedLabel.is === 'no label') {
    refused(
      `The start of ${handle} names its difficulty "${askedDifficulty}", and that is not a label the office knows. ` +
        `The labels are ${inAList([...askedLabel.labels], 'or')}. Nothing was written.`,
      400,
    )
  }
  if (askedLabel !== null && askedLabel.is === 'renamed') {
    refused(`The start of ${handle} names its difficulty "${askedDifficulty}", and that label is called ${askedLabel.now} now. Name the label as it is called now. Nothing was written.`, 400)
  }
  if (askedLabel !== null && askedLabel.is === 'a label' && marked !== null && marked.label !== askedLabel.name) {
    refused(
      `The start of ${handle} names its difficulty "${askedDifficulty}", and its brief marks ${marked.label} on line ` +
        `${String(marked.line)}. Keep one difficulty in both places. Nothing was written.`,
      400,
    )
  }
  const difficulty = askedLabel?.is === 'a label' ? askedLabel.name : marked?.label
  if (difficulty === undefined) {
    refused(
      `The start of ${handle} names the package "${task.title}" with no difficulty, and its brief marks none either. ` +
        'Name a Casting label as the difficulty, or mark it on a line of its own in the brief as "Difficulty: " followed by its label. Nothing was written.',
      400,
    )
  }
  const why = input.why?.trim() ?? ''
  if (why === '') {
    refused(
      `The start of ${handle} names the package "${task.title}" with no why, and one sentence says why this worker is ` +
        'given these points. Write it. Nothing was written.',
      400,
    )
  }
  return { package: { task: task.id, points: askedPoints, difficulty, why, askedAt }, title: task.title }
}

export interface TheWorkerRunAsked {
  run: string
  worker: { id: string; handle: string }
  workerRun: TheWorkerRun
  says: string
  forThePerson?: string
  limits: { says: string[] }
}

/**
 * ASK FOR A WORKER RUN. Writes the worker's entry of `workerRuns` on the supervisor's run as the asker, in state
 * `wanted`, and starts nothing. Every check is made before anything is written.
 */
export function askForAWorkerRun(input: {
  agent: string
  brief: string
  runtime?: string
  model?: string
  cutFrom?: string
  place?: TheWorkerPlaceAsked
  /** One of the sandbox's clones beside repo/, by its folder name or its absolute path, to cut the worker from. */
  clone?: string
  /** Paths the worker needs that the sandbox's template may leave out of its worktree, given to the launcher as --with-path. */
  paths?: string[]
  /** Files of the worker's worktree a codex worker is given at its start, given to the launcher as --image. */
  images?: string[]
  /** The packaged task the worker works on, with the points, difficulty and why that go with it. */
  package?: string
  points?: string[]
  difficulty?: string
  why?: string
  workspaceId: string
  actor: Actor
}): TheWorkerRunAsked {
  const { actor, workspaceId } = input
  const worker = theWorkerAskedFor(input.agent, actor)
  const supervisor = theSupervisorAsking(worker, actor)
  if (supervisor === null) {
    refused(
      `A worker run of ${worker.handle} is asked for only by its registered starter, proved by its own key, from a run of ` +
        `its own started in a sandbox, and this request was made by "${actor.id}". Nothing was written.`,
      403,
    )
  }
  // THE PATHS, by the one rule the launcher and the template's reader check too (src/config/a-workers-left-out-paths.mjs).
  const paths = input.paths ?? []
  const notPlain = whyNotPlainPaths(paths, 'paths')
  if (notPlain !== null) refused(`${notPlain}. Nothing was written.`, 400)
  // THE IMAGES, plain paths by the same rule, which has no comma: codex exec reads a comma in one -i as two files.
  const images = input.images ?? []
  const imagesNotPlain = whyNotPlainPaths(images, 'images')
  if (imagesNotPlain !== null) refused(`${imagesNotPlain}. ${AN_IMAGE_IS} Nothing was written.`, 400)
  const choice = theChoiceAsked(input.runtime, input.model, workspaceId, worker.handle)
  const noWorker = whyNoWorkerWouldStartIt()
  if (noWorker !== null) refused(`${noWorker} Nothing was written.`, 409)
  const run = theSupervisorsRun(supervisor, actor, workspaceId)
  const sandbox = theSandboxTheOfficeVouchesFor(run)
  if (sandbox === null && input.place === undefined) {
    throw new OutsidePlaceRequired(
      `Run ${run.id} of ${supervisor.handle} names no sandbox the office can vouch for: its folder is not one a container ` +
        'row of the ledger names. Name place as {"kind":"worktree","repository":"<name>","folder":"<path>"} or {"kind":"folder","folder":"<path>"}. Nothing was written.',
      409,
    )
  }
  if (sandbox !== null && input.place !== undefined) refused('A run in a sandbox cannot name place. Nothing was written.', 400)
  if (input.place !== undefined && (input.clone !== undefined || input.paths !== undefined || input.images !== undefined)) {
    const named = input.clone !== undefined ? 'clone' : input.paths !== undefined ? 'paths' : 'images'
    refused(`${named} cannot be named with place. Nothing was written.`, 400)
  }
  const outside = input.place === undefined ? null : thePlaceAsked(input.place, input.cutFrom, workspaceId, worker.handle)
  const briefFolder = outside === null ? sandbox!.folder : text(run.data['workingDirectory'])
  if (briefFolder === null) refused('The asking run names no workingDirectory for its brief. Nothing was written.', 409)
  const read = theBriefAndItsWordsAt(input.brief, briefFolder, outside !== null)
  const brief = read.brief
  // THE WORK AREA THE BRIEF'S DECLARATION NAMES, read from inside the sandbox folder as the brief is, and checked as the
  // launcher checks it. It is set with the ask below.
  const declared = theWorkAreaDeclaredBeside(input.brief, briefFolder, outside !== null)
  // THE DIFFICULTY THE BRIEF MARKS picks the label of the rows a roll draws from. A model the ask names is given whatever it marks.
  const marked = theDifficultyMarkedIn(read.words, input.brief)
  const askedAt = nowStamp()
  const work = thePackageAWorkerIsGiven(input, marked, workspaceId, worker.handle, askedAt)
  refuseASecondWorkerRun(worker, workspaceId, run)
  // THE CUT: the commit the ask chooses, checked in the sandbox's repository or in the clone it names, or, when it names
  // neither a clone nor a cutFrom, in the listed clone the asking run's worktree belongs to; and the worker's worktree if
  // it is there.
  const standsIn = outside === null && input.clone === undefined && input.cutFrom === undefined ? theCloneTheRunStandsIn(run, sandbox!.folder) : null
  const clone = input.clone !== undefined ? theCloneAsked(sandbox!.folder, input.clone) : standsIn !== null && 'clone' in standsIn ? standsIn.clone : undefined
  const cut = outside === null ? theCutTheAskChooses(run, sandbox!.folder, input.cutFrom, clone, standsIn !== null && 'repository' in standsIn ? standsIn : undefined) : outside.cut
  const there = outside === null ? theWorktreeThere(sandbox!.folder, worker.handle) : null
  // A worktree that is there is filed at the commit it stands at when the worker starts, so one whose HEAD git cannot
  // read is refused now.
  if (there !== null && there.head === null) refused(aHeadNobodyCanRead(there, 'ask'), 409)
  if (there !== null && cut.named !== null) {
    aCutTheSandboxCannotUse(() => {
      throw new PanelError(
        `The worker's worktree ${isThere(there)}, so it cannot be cut from ${theCutInWords(cut, run.id)}: a worktree that is there is ` +
          `used as it stands. Remove it first with node tools/remove-a-worktree.mjs ${there.dir}, or ask with no cutFrom to have the ` +
          'worker work in it as it stands. Nothing was written.',
        409, undefined, undefined, undefined, { code: 'workerCutWorktreeAlreadyThere', values: {} },
      )
    })
  }
  const before = theWorkerRunOf(sqlite, run.data, worker.id)
  // AN ASK WITH A CHOICE ROLLS NO CASTING ROW: the row is rolled only when the ask names neither, once, here. An ask
  // again on this run before the worker's run was filed keeps the draw its entry holds, as it is, because this write
  // replaces the entry and the only copy of that draw. An ask that names a model keeps it too, unused, so an ask after
  // it that names nothing takes it (round 47). After a start the draw is on the worker's run, and the router keeps it
  // from there.
  const carried = before?.started === undefined ? readCastingRoll(before?.castingRoll) : null
  const kept = carried?.choice === 'rolled' ? carried : null
  const rolled = (): CastingRollRecord => theDefaultCasting({ role: THE_WORKER, project: workspaceId, agentId: worker.id, difficulty: marked?.label ?? null }).record
  const card = choice === null ? theWorkerCard(kept ?? rolled(), marked) : null
  if (card !== null && !card.ok) refused(noWorkerRunCouldBeStarted(card.says, worker.handle), 409)
  if (before?.state === 'starting' && before.starting?.wrapper !== undefined && theLauncherRunIsGoing(before.starting.wrapper)) {
    refused(
      `The worker run of ${worker.handle} under run ${run.id} is being started now, by the launcher run ${before.starting.wrapper}. ` +
        'Nothing was written.',
      409,
    )
  }
  const replaces = before !== null && (before.state === 'wanted' || before.state === 'starting')
  const workerRun: TheWorkerRun = {
    state: 'wanted',
    askedAt,
    askedBy: { who: { kind: 'agent', id: supervisor.id }, session: run.id },
    handle: worker.handle,
    brief,
    ...(outside === null ? { sandbox: sandbox! } : { place: outside.place }),
    ...(replaces ? { replaced: { askedAt: before.askedAt } } : {}),
    ...(work === null ? {} : { package: work.package }),
    ...(choice === null ? {} : { chosen: { runtime: choice.runtime, model: choice.model, by: { kind: 'agent', id: supervisor.id } } }),
    row: choice === null ? card!.row : choice.row,
    ...(card !== null ? { castingRoll: card.roll } : kept !== null ? { castingRoll: kept } : {}),
    cut,
    ...(paths.length === 0 ? {} : { paths }),
    ...(images.length === 0 ? {} : { images }),
  }
  const counted = theCountsUnder(run, worker.id)
  const runtime = choice === null ? card!.program : choice.runtime
  const noImages = whyNoImagesFor(runtime, images)
  if (noImages !== null) refused(`${noImages} Nothing was written.`, 400)
  const imageNotThere = outside === null ? whyAnImageIsNotThere(images, paths, there, sandbox!.folder, cut) : null
  if (imageNotThere !== null) refused(`${imageNotThere} Nothing was written.`, 400)
  const exec = theLaunchersCommandFor(runtime) === 'exec'
  const command = exec ? `exec --agent ${worker.handle} --runtime ${runtime}` : 'worker'
  const given = choice === null ? null : theStartOfTheRow(choice.row, choice).model
  const chose =
    (choice === null
      ? aRolledRowSays(card!.program, card!.model, card!.row.id, card!.says)
      : `${supervisor.handle} chose ${choice.runtime} with the model ${choice.model}${given === choice.model ? '' : `, which the launcher is given as ${String(given)}`}, ` +
        `from row ${String(choice.row.id)} of the Casting table for the worker card. ${AS_THE_ASK_READ_IT}` +
        (kept === null ? '' : ' The Casting roll an earlier ask made is kept on the entry, unused, so a later ask that names no model takes it.')) +
    (exec && outside === null ? ` It runs in its own worktree, ${theWorkersOwnWorktree(sandbox!.folder, worker.handle)}.` : '')
  const foundIn =
    standsIn !== null && 'clone' in standsIn
      ? theCommitWasLookedForInTheClone(run.id, standsIn.dir, standsIn.clone)
      : ''
  const cutSays =
    foundIn +
    (there === null
      ? `${theWorktreeIsToBeCutFrom(cut, run.id)} ` +
        (cut.named === null ? 'If its worktree is there by then, it is used as it stands, and the cut is not used.' : 'If its worktree is there by then, the start fails. While the gate on worker cuts is off, the worker starts in that worktree as it stands instead.')
      : `Its worktree ${isThere(there)}. A worktree that is there when the worker starts is used as it stands, so the cut ${cut.commit} is not used.`)
  const pathsSays =
    paths.length === 0
      ? ''
      : ` The ask names the paths ${paths.join(', ')}. The launcher is given each as --with-path, so it is checked out in the ` +
        "worker's worktree even if the sandbox's template leaves it out. The launcher refuses a path the template does not " +
        'leave out, and then the start fails.'
  const imagesSays = whatTheAskSaysOfItsImages(images, there !== null)
  // A DECLARED AREA IS SET WITH THE ASK, in one write and in the asker's name, through the change every area goes through:
  // an asker who may not change the worker's area is refused there, and the ask is not kept either. The seal of the run
  // this ask starts empties it again, and so does the ask's failing (`theSealEmptiesTheAreaSetForItsRun`).
  const set = sqlite.transaction(() => {
    write(run.id, worker.id, workerRun, actor)
    if (declared.workArea === null) return null
    return changeWorkArea(worker.id, workspaceId, declared.workArea, `The brief ${input.brief} declares this work area for the worker run asked on run ${run.id}.`, actor, {
      declared: { brief: input.brief, door: 'worker-run', askedOn: run.id, askedAt: workerRun.askedAt },
    })
  })()
  // A START WITH NO WORK AREA SAYS SO, AND HOW ITS SUPERVISOR GIVES IT ONE (the sentences' own export).
  const noWorkAreaReminder =
    set === null && (worker.workArea === null || worker.workArea.length === 0) && theRoleCardsAreRead() &&
    aRoleNeedsARegisteredWorkArea(theRoleCards(), worker.role)
      ? ` ${theReminderAStartWithNoWorkAreaCarries(worker.handle)}`
      : ''
  const outsidePlaceWords = outside?.place.kind === 'folder' ? 'existing folder' : 'new worktree'
  const outsideStartWords = outside?.place.kind === 'worktree'
    ? 'The host launcher will make the worktree at the chosen cut and start the worker there.'
    : 'The host launcher will use the folder as it stands and start the worker there.'
  return {
    run: run.id,
    worker: { id: worker.id, handle: worker.handle },
    workerRun,
    ...(outside === null ? {} : { forThePerson: FOR_THE_PERSON }),
    says: outside !== null
      ? `A worker run of ${worker.handle} is asked for, under run ${run.id}, in the ${outsidePlaceWords} ${outside.place.folder}. Nothing has started yet. ${outsideStartWords} ${chose} ${thePackageSays(work)}${set === null ? '' : ` ${theDeclaredAreaWasSetSays(worker.handle, set.workArea ?? [], declared.file, supervisor.handle)}`}${noWorkAreaReminder} ${HOST_DEFAULT_PERMISSIONS} ${PASS_ON_THE_SAFETY_LINE}`
      : `A worker run of ${worker.handle} is asked for, under run ${run.id}, in sandbox ${sandbox!.instance}. Nothing has started ` +
      `yet. The message worker tries to start it on a later pass, with node tools/sandbox.mjs ${command} --parent ${run.id}. ` +
      `${chose} ${thePackageSays(work)} ${cutSays}${pathsSays}${imagesSays} Run ${run.id}'s ${WORKER_RUNS} field says where the ask is.` +
      (replaces ? ` It replaces the ask made at ${before.askedAt}.` : '') +
      (set === null ? '' : ` ${theDeclaredAreaWasSetSays(worker.handle, set.workArea ?? [], declared.file, supervisor.handle)}`) +
      noWorkAreaReminder,
    limits: {
      says: [
        'A supervisor starts its own workers, and the office only reminds how many it started.',
        `Runs filed under run ${run.id} for an agent so far: ${String(counted.filed)}, and ${String(counted.running)} of them say they are running.`,
        `Worker runs asked on run ${run.id} that wait to start, this one included: ${String(counted.waiting + 1)}.`,
        'Nothing here is refused for a count.',
      ],
    },
  }
}

/**
 * THE COUNTS THE ASK REMINDS OF, read before it is written: the runs filed for an agent with this run as their parent,
 * how many of them say they are running, and the other worker runs asked on it that still wait to start.
 */
function theCountsUnder(run: PanelRecord, agentId: string): { filed: number; running: number; waiting: number } {
  const row = sqlite
    .prepare(
      "SELECT count(*) AS filed, coalesce(sum(CASE WHEN json_extract(data, '$.state') = 'running' THEN 1 ELSE 0 END), 0) AS running " +
        "FROM records WHERE kind = 'session' AND workspace_id = ? AND deleted_at IS NULL AND json_extract(data, '$.parentAttachment') = ? " +
        "AND (json_extract(data, '$.servingAgentId') IS NOT NULL OR json_extract(data, '$.servingAgent') IS NOT NULL)",
    )
    .get(run.workspaceId, run.id) as { filed: number; running: number }
  const waiting = theOtherWorkerRunsWanted(sqlite, run.data, agentId)
  return { filed: row.filed, running: row.running, waiting }
}

// ================================================================================================== the worker's half

export interface AWorkerRunToStart {
  run: string
  agentId: string
  handle: string
}

/**
 * The worker runs in this project that wait for the message worker: wanted, and the worker has no run going. An entry kept
 * under an alias filed for the worker is handed out under the worker's canonical id, which the launcher's run names.
 */
export function theWorkerRunsToStart(workspaceId: string): AWorkerRunToStart[] {
  const aliases = new Map(readRegistryAliases(sqlite).map((row) => [row.aliasId, row.canonicalId]))
  const rows = sqlite
    .prepare(
      // THE WHERE OF `records_session_holds_worker_runs_idx` (migration 0296, wave 13y round 74), so SQLite reads that index.
      "SELECT records.id AS run, entry.key AS agentId FROM records, json_each(records.data, '$." + WORKER_RUNS + "') AS entry " +
        "WHERE records.kind = 'session' AND records.workspace_id = ? AND records.deleted_at IS NULL " +
        `AND ${theWordsOfAStoredField(STORED_FIELDS.sessionHoldsWorkerRuns, 'records.data')} ` +
        "AND json_extract(entry.value, '$.state') = 'wanted' " +
        "AND NOT EXISTS (SELECT 1 FROM agent_starter_changes AS change WHERE change.state = 'waiting' AND change.agent_id = " +
        'coalesce((SELECT value FROM json_each(?) WHERE key = entry.key), entry.key)) ' +
        'ORDER BY records.updated_at ASC, records.id ASC, entry.key ASC LIMIT 25',
    )
    .all(workspaceId, JSON.stringify(Object.fromEntries(aliases))) as { run: string; agentId: string }[]
  const out: AWorkerRunToStart[] = []
  for (const row of rows) {
    const agentId = aliases.get(row.agentId) ?? row.agentId
    if (aWaitingStarterChangeSays(agentId) !== null) continue
    if (runServing(agentId, workspaceId) !== null) continue
    const registered = readParticipant({ kind: 'agent', id: agentId })
    if (registered === null || !('startedBy' in registered)) continue
    out.push({ run: row.run, agentId, handle: registered.handle })
  }
  return out
}

/**
 * THE PROJECTS THE MESSAGE WORKER SERVES: every project on the office's list, oldest first. The message centre is not
 * one. The worker reads the worker runs wanted in each, and the two run doors take a run of any of them. A run filed in
 * a project that is not on the list is not served.
 */
export function theProjectsTheWorkerServes(): string[] {
  return listWorkspaces().map((project) => project.id)
}

/** One row of GET /api/worker/worker-runs: a worker run to start, with the project the run that asked for it is filed in. */
export type AServedWorkerRunToStart = AWorkerRunToStart & { workspaceId: string }

/** The worker runs to start in every project the message worker serves, project by project in the list's order. */
export function theWorkerRunsToStartInEveryServedProject(): AServedWorkerRunToStart[] {
  return theProjectsTheWorkerServes().flatMap((workspaceId) => theWorkerRunsToStart(workspaceId).map((row) => ({ ...row, workspaceId })))
}

/**
 * THE RUN A WORKER-RUN DOOR NAMES, read by its id in the project it is filed in, whatever project the request names.
 * The door then works in that project. An id nothing holds is refused as at every door. A run filed in a project that
 * is not on the office's list is refused in words, and nothing is written.
 */
export function theRunOfAServedProject(run: string): PanelRecord {
  const record = getRecord(run)
  if (record === null) throw noRecordHasThisId(run)
  if (!theProjectsTheWorkerServes().includes(record.workspaceId)) {
    throw new PanelError(
      `Run ${record.id} is filed in "${record.workspaceId}", which is not on the office's list of projects, so the message worker does not serve it. Nothing was written.`,
      409,
    )
  }
  return record
}

export interface TheWorkerRunStarts {
  run: string
  agentId: string
  handle: string
  runtime: string
  model: string
  /** The ask's choice, or null because the Casting row was given. */
  chosen: TheWorkerRun['chosen'] | null
  /** Where the Casting row's program and model came from, or null because the ask chose them. */
  castingSays: string | null
  /**
   * The native selection of the Casting row the ask kept, as the office answers it for this start, which the launcher
   * is given as --selection and asks the office for again; null for a row with no native data.
   */
  selection: CastingSelection | null
  /** The launcher's command: `worker`, or `exec` for a dsh or OpenCode worker. */
  verb: 'worker' | 'exec'
  /** The worker's own worktree, given to `exec` only, and null for `worker`, which makes it itself. */
  worktree: string | null
  /**
   * The commit the launcher is given as --cut-from, which it files the run at: the commit it makes the worker's worktree
   * at, or the commit a worktree that is there stands at, as the worker works in it as it stands.
   */
  cutFrom: string
  /** The sandbox's clone the worktree is made from, given as `--clone` with `cutFrom`, or null for repo/ or a worktree that is there. */
  clone: string | null
  /** The paths the ask named, given as `--with-path` each, and empty when it named none. */
  paths: string[]
  /** The images the ask named, given as `--image` each, and empty when it named none. */
  images: string[]
  instance?: string
  sandboxes?: string
  place?: TheWorkerPlace
  forThePerson?: string
  says?: string
  brief: string
  /** The supervisor's run, which the worker's run is filed under. */
  parent: string
  workspaceId: string
}

/** The supervisor's run and one worker's entry on it, or a refusal. */
function theRunHolding(run: string, agentId: string, workspaceId: string): { record: PanelRecord; workerRun: TheWorkerRun } {
  const record = getRecord(run)
  if (record === null || record.kind !== 'session' || record.workspaceId !== workspaceId) {
    refused(`There is no run ${run} in this project. Nothing was written.`, 404)
  }
  const workerRun = theWorkerRunOf(sqlite, record.data, agentId)
  if (workerRun === null) refused(`Run ${run} holds no ask for a worker run of agent ${agentId}. Nothing was written.`, 409)
  return { record, workerRun }
}

/** The refusal of an ask whose worker could be given no row, after the words saying why. */
export const noWorkerRunCouldBeStarted = (says: string, handle: string): string => `${says} So no worker run of ${handle} could be started. Nothing was written.`

const AS_THE_ASK_READ_IT = 'It starts on that row as the ask read it, and a changed or held row refuses the start.'

/** What the answer says of the row the Casting roll gave, when the ask named no model; `says` is the roll's own words. */
export const aRolledRowSays = (program: string, model: string, row: number, says: string): string =>
  `No model was named, so it is given ${program} with the model ${model}, from row ${String(row)} of the Casting table for the worker card. ` +
  `${says} ${AS_THE_ASK_READ_IT} Nothing rolls again when it starts.`

/** Write `failed` on the entry, tell the supervisor in one line, and refuse with the same words. */
function itFailed(record: PanelRecord, agentId: string, workerRun: TheWorkerRun, says: string, status: number): never {
  write(record.id, agentId, { ...workerRun, state: 'failed', failed: { at: nowStamp(), says } })
  aFailedStartEmptiesTheAreaOfItsAsk(agentId, record.workspaceId, { door: 'worker-run', askedOn: record.id, askedAt: workerRun.askedAt }, theOfficeWritesIt())
  tellTheSupervisor(record, workerRun, says)
  refused(`${says} The ask is now failed. Nothing was started.`, status)
}

/** The line to the supervisor that asked, saying the worker run of `handle` under `run` did not start, and why. */
export const aWorkerRunDidNotStart = (handle: string, run: string, says: string): string =>
  `The worker run of ${handle} under run ${run} did not start. ${says}`

/** One line to the supervisor that asked, saying the worker run did not start. Nothing is said when it cannot be read. */
function tellTheSupervisor(record: PanelRecord, workerRun: TheWorkerRun, says: string): void {
  const to = workerRun.askedBy.who
  if (readParticipant(to) === null) return
  writeASystemLineToOne(
    to,
    record.workspaceId,
    SYSTEM_LINES.aWorkerDidNotStart(aWorkerRunDidNotStart(workerRun.handle, record.id, says)),
    THE_OFFICE,
    { run: record.id },
  )
}

/** Why a worker run that is no longer wanted is not started, in words, so the stored state is not put in a sentence. */
const NO_LONGER_WANTED: Record<Exclude<WorkerRunState, 'wanted'>, string> = {
  starting: 'is being started already',
  started: 'has started already',
  failed: 'failed',
}

/**
 * THE MESSAGE WORKER IS STARTING THE WORKER RUN, with its launcher run `wrapper`. Everything the ask was checked for is
 * checked again; a failure is written as `failed` and refused. A worker that is still running makes the ask wait.
 * Otherwise the entry becomes `starting`, and the reply is what the launcher is given.
 */
export function startingTheWorkerRun(input: { run: string; agent: string; wrapper: string; workspaceId: string }): TheWorkerRunStarts {
  const { record, workerRun } = theRunHolding(input.run, input.agent, input.workspaceId)
  if (workerRun.state !== 'wanted') {
    refused(`The worker run of ${workerRun.handle} under run ${record.id} ${NO_LONGER_WANTED[workerRun.state]}. Nothing was written.`, 409)
  }
  const wrapper = getRecord(input.wrapper)
  if (wrapper === null || wrapper.kind !== 'session' || !theLauncherIsForThisWorkerRun(wrapper.data, record.id, input.agent, (id) => theCanonicalAgentId(sqlite, id))) {
    refused(
      `Run ${input.wrapper} is not a launcher run the office started for a worker run of ${workerRun.handle} under run ${record.id}. ` +
        'Nothing was written.',
      409,
    )
  }
  const failed = (says: string): never => itFailed(record, input.agent, workerRun, says, 409)
  const worker = theAgentRowAnIdNames(input.agent)
  if (worker === null || !('startedBy' in worker)) return failed(`Agent ${input.agent} is not one the office knows.`)
  if (worker.retired === true) return failed(`${worker.handle} has been retired since the worker run was asked for.`)
  if (record.data['state'] !== 'running') return failed(`Run ${record.id}, which asked for it, is no longer running.`)
  const waiting = aWaitingStarterChangeSays(worker.id)
  if (waiting !== null) refused(`${waiting} The ask waits. Nothing was written.`, 409)
  const serving = runServing(worker.id, input.workspaceId)
  if (serving !== null) refused(`Run ${serving} is still serving ${worker.handle}. The ask waits. Nothing was written.`, 409)
  const place = workerRun.place
  const sandbox = workerRun.sandbox
  const folder = place === undefined ? theSandboxFolderOf(record.data) : text(record.data['workingDirectory'])
  if (place === undefined && (sandbox === undefined || folder !== sandbox.folder)) return failed(`The office can no longer vouch for sandbox ${sandbox?.folder ?? ''}.`)
  if (place !== undefined && theSandboxTheOfficeVouchesFor(record) !== null) return failed('The asking run is now in a sandbox the office vouches for.')
  if (folder === null) return failed('The asking run names no workingDirectory for its brief.')
  let brief: TheWorkerRun['brief']
  try {
    brief = place === undefined ? theBriefAt(workerRun.brief.path, folder) : theBriefAndItsWordsAt(workerRun.brief.path, folder, true).brief
  } catch (error) {
    return failed(error instanceof Error ? error.message.replace(/ Nothing was written\.$/, '') : String(error))
  }
  if (brief.sha256 !== workerRun.brief.sha256) return failed(`The brief ${brief.path} changed after it was asked for.`)
  let outsideCut: NonNullable<TheWorkerRun['cut']> | null = null
  if (place !== undefined) {
    const oldCut = workerRun.cut
    if (oldCut === undefined) return failed('The ask holds no commit.')
    try {
      const asked: TheWorkerPlaceAsked = place.kind === 'worktree'
        ? { kind: 'worktree', folder: place.folder, repository: place.repository.name }
        : { kind: 'folder', folder: place.folder }
      const checked = thePlaceAsked(asked, place.kind === 'worktree' ? oldCut.commit : undefined, input.workspaceId, worker.handle)
      if (place.kind === 'worktree' && (checked.place.repository === null || checked.place.repository.root !== place.repository.root || checked.cut.commit !== oldCut.commit)) throw new Error('The repository or commit the ask kept is no longer available.')
      outsideCut = checked.cut
    } catch (error) {
      return failed(error instanceof Error ? error.message.replace(/ Nothing was written\.$/, '') : String(error))
    }
  }
  // THE ROW THE ASK KEPT, read again as the ask read it: a changed, held or removed row fails the start, and no other row
  // is taken. Nothing rolls here (round 46). The launcher is given the row's program and model by theStartOfTheRow, by
  // the same rule the ask used for the choice or for the roll the ask kept (wave 13n round BQ), so a kept roll whose row
  // did not change keeps the roll's own start rule.
  const kept = theKeptRowAtTheStart(workerRun.row)
  if (!kept.ok) return failed(kept.says)
  const chosen = workerRun.chosen
  let given: { runtime: string; model: string; casting?: number; castingSays?: string; castingRoll?: CastingRollRecord }
  if (chosen !== undefined) {
    given = theStartOfTheRow(kept.row, chosen)
  } else {
    const out = whyTheWorkerRowIsOut(kept.read)
    if (out !== null) return failed(out)
    const roll = readCastingRoll(workerRun.castingRoll)
    if (roll === null) return failed('The ask named no model and keeps no Casting roll, because it was made before an ask kept its roll. Ask again.')
    const start = theStartOfARoll(roll)
    if (start.runtime === null || start.model === null || start.rowId !== kept.row.id) return failed(`The Casting roll the ask kept does not name row ${String(kept.row.id)}, the row it chose. ${roll.says}`)
    const named = theKeptRollUsesTheRowsCells(roll, kept.row) ? { runtime: kept.row.program, model: kept.row.model } : { runtime: start.runtime, model: start.model }
    const limited = theLimitsOn(named.runtime, named.model, theLimitsNow(Date.now()))
    if (limited.length > 0) return failed(`Casting row ${String(kept.row.id)} cannot be taken: ${limited.join(' ')}`)
    given = { ...theStartOfTheRow(kept.row, named), casting: kept.row.id, castingSays: roll.says, castingRoll: roll }
  }
  const runtime = given.runtime
  if (!theLauncherStarts(runtime)) return failed(theLauncherCannotStart(kept.row.id, runtime, given.model))
  // A NATIVE ROW'S SELECTION goes to the launcher as the office answers it for this start, and the launcher asks the
  // office again before it starts anything. The answer must be for the kept row at the revision the ask read.
  let selection: CastingSelection | null = null
  if (kept.row.revision !== null) {
    selection = theModelARunStartsWith({ place: 'builder', agentId: worker.id, runtime, model: given.model, project: input.workspaceId }).selection ?? null
    if (selection?.casting?.id !== kept.row.id || selection.casting.revision !== kept.row.revision) {
      return failed(`The office's answer for this start is not the native selection of Casting row ${String(kept.row.id)} that the ask read. It is not swapped for another row.`)
    }
  }
  if (place !== undefined && outsideCut !== null) {
    const cutFrom = place.kind === 'worktree' ? outsideCut.commit : null
    write(record.id, worker.id, {
      ...workerRun, state: 'starting', starting: {
        at: nowStamp(), wrapper: wrapper.id, ...given, cutFrom,
        cutSays: place.kind === 'worktree' ? 'The host launcher makes the worktree at the chosen cut and starts the worker there.' : 'The host launcher uses the folder as it stands and starts the worker there.',
        ...theEffortTheLauncherIsAnswered({ agentId: worker.id, handle: worker.handle, runtime: given.runtime, model: given.model, project: input.workspaceId }),
      },
    })
    return {
      run: record.id, agentId: worker.id, handle: worker.handle, runtime: given.runtime, model: given.model,
      chosen: chosen ?? null, castingSays: given.castingSays ?? null, selection, verb: theLaunchersCommandFor(runtime),
      worktree: null, cutFrom: outsideCut.commit, clone: null, paths: [], images: [], brief: workerRun.brief.path,
      parent: record.id, workspaceId: input.workspaceId, place, forThePerson: FOR_THE_PERSON, says: PASS_ON_THE_SAFETY_LINE,
    }
  }
  if (sandbox === undefined) return failed('The ask names neither a sandbox nor a place.')
  // THE CUT, used only when the worker's worktree is made now: a worktree that is there is used as it stands, and a cut
  // the ask named is then refused, unless the gate `worker-cuts-the-sandbox-cannot-use` is off. The launcher files the
  // run at the --cut-from it is given, so a worktree that is there is given the commit it stands at, and one whose HEAD
  // git cannot read fails, whatever the gate says.
  const cut = workerRun.cut
  if (cut === undefined) return failed('The ask chose no commit to cut the worker from, because it was made before an ask chose one. Ask again.')
  const there = theWorktreeThere(sandbox.folder, worker.handle)
  const reused = there === null ? null : { there, head: there.head ?? failed(aHeadNobodyCanRead(there, 'start')) }
  if (there !== null && cut.named !== null) {
    aCutTheSandboxCannotUse(() => failed(
      `The worker's worktree ${isThere(there)}, so it cannot be cut from ${theCutInWords(cut, record.id)}. Remove it with ` +
        `node tools/remove-a-worktree.mjs ${there.dir} and ask again.`,
    ))
  }
  const cutFrom = there === null ? cut.commit : null
  const cutSays =
    reused === null
      ? aStartCutsTheWorktree(theWorkersOwnWorktree(sandbox.folder, worker.handle), cut, record.id)
      : aStartUsesAWorktreeThatIsThere(reused.there, reused.head, cut.commit)
  // THE IMAGES, checked again where the worktree now stands, as the launcher checks them once it is made.
  const images = workerRun.images ?? []
  const noImages = whyNoImagesFor(runtime, images)
  if (noImages !== null) return failed(noImages)
  const imageNotThere = whyAnImageIsNotThere(images, workerRun.paths ?? [], there, sandbox.folder, cut)
  if (imageNotThere !== null) return failed(imageNotThere)
  // A dsh or OpenCode program goes to `exec`, chosen or rolled, because `worker` takes claude-code and codex only.
  const verb = theLaunchersCommandFor(runtime)
  write(record.id, worker.id, {
    ...workerRun,
    state: 'starting',
    starting: {
      at: nowStamp(),
      wrapper: wrapper.id,
      ...given,
      cutFrom,
      cutSays,
      ...theEffortTheLauncherIsAnswered({ agentId: worker.id, handle: worker.handle, runtime: given.runtime, model: given.model, project: input.workspaceId }),
    },
  })
  return {
    run: record.id,
    agentId: worker.id,
    handle: worker.handle,
    runtime: given.runtime,
    model: given.model,
    chosen: chosen ?? null,
    castingSays: given.castingSays ?? null,
    selection,
    verb,
    worktree: verb === 'exec' ? theWorkersOwnWorktree(sandbox.folder, worker.handle) : null,
    cutFrom: reused === null ? cut.commit : reused.head,
    clone: reused === null && cut.clone !== undefined ? cut.clone : null,
    paths: workerRun.paths ?? [],
    images,
    instance: sandbox.instance,
    sandboxes: dirname(sandbox.folder),
    brief: workerRun.brief.path,
    parent: record.id,
    workspaceId: input.workspaceId,
  }
}

/**
 * THE LAUNCHER ENDED. Still `starting` means it filed no run: the ask is failed and the supervisor told. `started`
 * keeps how it ended and the worker's open process row, or says none was open.
 */
export function theWorkerRunsLauncherEnded(input: { run: string; agent: string; wrapper: string; ok: boolean; says: string; workspaceId: string; beforeRuntime?: boolean }): TheWorkerRun {
  const { record, workerRun } = theRunHolding(input.run, input.agent, input.workspaceId)
  const launcher = { at: nowStamp(), ok: input.ok, says: input.says }
  if (workerRun.state === 'starting' && workerRun.starting?.wrapper === input.wrapper) {
    return itFailed(record, input.agent, { ...workerRun, launcher }, `The launcher ended before it filed a run: ${input.says}`, 409)
  }
  if (workerRun.state !== 'started' || workerRun.starting?.wrapper !== input.wrapper || workerRun.started === undefined) {
    refused(`The worker run of ${workerRun.handle} under run ${record.id} was not started by launcher run ${input.wrapper}. Nothing was written.`, 409)
  }
  if (workerRun.place !== undefined && input.beforeRuntime === true && !input.ok) {
    return itFailed(record, input.agent, { ...workerRun, launcher }, input.says, 409)
  }
  const rows = listResources({ workspaceId: input.workspaceId, sessionRecordId: workerRun.started.run }).filter((row) => row.type === 'process')
  const process =
    rows.length === 0
      ? { row: null, says: `No open process row of run ${workerRun.started.run} was found when the launcher ended. The worker may have ended already, or no process was registered.` }
      : { row: rows[0]!.id, says: `Process row ${rows[0]!.id} of run ${workerRun.started.run} was open when the launcher ended.` }
  const after: TheWorkerRun = { ...workerRun, launcher, process }
  write(record.id, input.agent, after)
  // A LAUNCHER THAT FILED THE RUN AND THEN ENDED BADLY is said to the supervisor too: the worker may never have started.
  // When its run is not running, it did not start, and the area its ask set goes as for any start that failed.
  if (!input.ok) {
    if (getRecord(workerRun.started.run)?.data['state'] !== 'running') {
      aFailedStartEmptiesTheAreaOfItsAsk(input.agent, record.workspaceId, { door: 'worker-run', askedOn: record.id, askedAt: workerRun.askedAt }, theOfficeWritesIt())
    }
    tellTheSupervisor(record, workerRun, `The launcher filed run ${workerRun.started.run} and then ended badly: ${input.says}`)
  }
  return after
}

// ================================================================================================== the run-key door

/**
 * THE SUPERVISOR'S RUN WHOSE WORKER RUN THIS NEW RUN IS, when the office's key files it, or null when it is not one.
 * Asked by `mintARunKey` in api/records.ts, inside the create's transaction. It asks the parent rule's fourth rule
 * again (`theAgentOfAnAskedWorkerRunUnder` in lib/records/may-write.ts), so the parent the create took and the key it mints read
 * one rule, and only for the agent the run serves.
 */
export function theWorkerRunThisRunStarts(record: PanelRecord, agentId: string, actor: Actor): string | null {
  const parentId = text(record.data['parentAttachment'])
  const parent = parentId === null ? null : getRecord(parentId)
  if (parent === null || parent.kind !== 'session') return null
  if (theAgentOfAnAskedWorkerRunUnder(parent, record.data, actor) !== agentId) return null
  const workerRun = theWorkerRunOf(sqlite, parent.data, agentId)
  if (workerRun?.place !== undefined && Object.hasOwn(record.data, 'sandbox')) {
    refused('A worker run filed for an outside place may not name a sandbox. Nothing was written.', 409)
  }
  return parent.id
}

/** The worker's run is filed and its key minted: the entry is `started`. Inside the create's transaction. */
export function sayTheWorkerRunStarted(parentId: string, agentId: string, runId: string, runKeyId: string): void {
  const parent = getRecord(parentId)
  const workerRun = parent === null ? null : theWorkerRunOf(sqlite, parent.data, agentId)
  // A THROW HERE UNDOES THE CREATE, so a run is never filed for an ask that is not starting.
  if (workerRun === null || workerRun.state !== 'starting') {
    throw new Error(`Run ${parentId} holds no worker run of agent ${agentId} that is starting, while run ${runId} was filed for it.`)
  }
  write(parentId, agentId, { ...workerRun, state: 'started', started: { at: nowStamp(), run: runId, runKeyId } })
  if (workerRun.place !== undefined) writeTheWorkerPlace(runId, workerRun.place, theOfficeWritesIt())
  // HOW ITS MODEL WAS CHOSEN goes onto the worker's own run, where the agent's later starts read its roll.
  const roll = readCastingRoll(workerRun.starting?.castingRoll)
  if (roll !== null) writeTheCastingRoll(runId, roll, theOfficeWritesIt())
  // WHICH COMMIT IT WAS ASKED TO BE CUT FROM, and whether it was, goes onto it too, beside the commit it was filed at.
  const cut = workerRun.cut
  const starting = workerRun.starting
  if (cut !== undefined && starting?.cutSays !== undefined && starting.cutFrom !== undefined) {
    writeTheCutAsked(runId, theCutAskedOf(cut, starting.cutFrom, starting.cutSays, text(getRecord(runId)?.data['tip'])), theOfficeWritesIt())
  }
  // WHICH IMAGES IT WAS GIVEN goes onto it as well. The launcher files no run while one of them is not a file there.
  const images = workerRun.images ?? []
  if (images.length > 0) {
    if (workerRun.sandbox === undefined) throw new Error('An outside worker run cannot hold images.')
    const worktree = theWorkersOwnWorktree(workerRun.sandbox.folder, workerRun.handle)
    writeTheImagesGiven(runId, { images, worktree, says: theImagesGivenSay(images, worktree) }, theOfficeWritesIt())
  }
  // THE PACKAGE IT WAS STARTED FOR goes onto it too, so the package's page finds every worker it was given to without
  // reading the supervisor's entry, and a run that outlives its project's page keeps its own account.
  if (workerRun.package !== undefined) writeTheWorkerPackage(runId, workerRun.package, theOfficeWritesIt())
}

/** What the worker's run keeps of its cut: what the start said, and where the run was filed, compared with the cut. */
function theCutAskedOf(cut: NonNullable<TheWorkerRun['cut']>, cutFrom: string | null, cutSays: string, stoodAt: string | null): TheCutAsked {
  const used = cutFrom !== null
  const filed =
    stoodAt === null
      ? 'The run names no commit it was filed at, so where its worktree stood is not known.'
      : !used || stoodAt === cut.commit
        ? `The run was filed at ${stoodAt}.`
        : `The run was filed at ${stoodAt}, so its worktree did not stand at the commit asked.`
  return { commit: cut.commit, named: cut.named, used, stoodAt, says: `${cutSays} ${filed}` }
}

/**
 * THE WORKERS A RUN ASKED FOR, READ FOR ITS PAGE, or null when it keeps no `workerRuns`. Wave 13j round loop-4, item 0:
 * the record's answer carries it on a run, and src/web/components/TheWorkersOfARun.tsx draws it in Normal mode.
 *
 * Each entry is read with `readTheWorkerRun`, oldest ask first. The worker's run is read beside it only when it is a
 * live run in this run's project, so a page never draws a run that was deleted or one this project does not hold; the
 * id is still given, so the page can say which run is not here. An entry that does not read as an ask is counted in
 * `unreadable` and not dropped without a word.
 */
export function theWorkersARunStarted(run: PanelRecord): TheWorkersARunStarted | null {
  const all = run.data[WORKER_RUNS]
  if (!isObject(all) || Object.keys(all).length === 0) return null
  const read: { askedAt: string; worker: AWorkerARunAskedFor }[] = []
  let unreadable = 0
  for (const [agent, value] of Object.entries(all)) {
    const asked = readTheWorkerRun(value)
    if (asked === null) {
      unreadable += 1
      continue
    }
    const runId = text(asked.started?.run)
    const found = runId === null ? null : getRecord(runId)
    const live = found !== null && found.kind === 'session' && found.workspaceId === run.workspaceId && found.deletedAt === null ? found : null
    const registered = readParticipant({ kind: 'agent', id: agent })
    const named = readTheWorkerPackage(asked.package)
    const packaged = named === null ? null : getRecord(named.task)
    read.push({
      askedAt: asked.askedAt,
      worker: {
        agent,
        name: registered === null ? null : text(registered.name),
        handle: asked.handle,
        asked: asked.state,
        failedSays: asked.state === 'failed' ? text(asked.failed?.says) : null,
        modelGiven: text(asked.starting?.model),
        package: named === null ? null : { ...named, title: packaged !== null && packaged.kind === 'task' ? packaged.title : null },
        runId,
        run: live === null ? null : theWorkersRun(live),
      },
    })
  }
  read.sort((a, b) => a.askedAt.localeCompare(b.askedAt) || a.worker.agent.localeCompare(b.worker.agent))
  return { workers: read.map((one) => one.worker), unreadable }
}

/**
 * What a page draws of a worker's own run: its title, state and model, a long wait on a usage limit, whether it sealed,
 * and its receipt's cost.
 */
function theWorkersRun(record: PanelRecord): NonNullable<AWorkerARunAskedFor['run']> {
  const receipt = record.data['usageReceipt']
  const cost = isObject(receipt) ? receipt['costUsd'] : undefined
  const waitsLongUntil = theNextTryOfALongWait(record.data)
  return {
    title: record.title,
    state: text(record.data['state']),
    ...(waitsLongUntil === null ? {} : { waitsLongUntil }),
    model: text(record.data['model']),
    sealed: text(record.data['sealedTip']) !== null,
    receipt: isObject(receipt) ? { costUsd: typeof cost === 'number' && Number.isFinite(cost) ? cost : null } : null,
  }
}

/**
 * THE SUPERVISOR'S RUN THAT ASKED FOR THIS RUN AS A WORKER'S, or null when no run did. Wave 13j round loop-5, item 2: the
 * record's answer carries it on a run, and src/web/components/TheWorkersOfARun.tsx draws it on the run's two pages.
 *
 * THE PARENT ALONE IS NOT ENOUGH: every continued run names one too. So the parent must be a live run in this run's
 * project whose own `workerRuns` keeps an entry that is `started` and names this run as the run it started. Only the
 * office writes that entry, in `sayTheWorkerRunStarted` above, inside the create that filed this run.
 */
export function theRunThatAskedForThisWorker(run: PanelRecord): TheRunThatAskedForAWorker | null {
  const parentId = text(run.data['parentAttachment'])
  const parent = parentId === null ? null : getRecord(parentId)
  if (parent === null || parent.kind !== 'session' || parent.workspaceId !== run.workspaceId || parent.deletedAt !== null) return null
  const all = parent.data[WORKER_RUNS]
  if (!isObject(all)) return null
  for (const value of Object.values(all)) {
    const asked = readTheWorkerRun(value)
    if (asked === null || asked.state !== 'started' || asked.started?.run !== run.id) continue
    const asker = readParticipant(asked.askedBy.who)
    return { run: parent.id, title: parent.title, askerId: asked.askedBy.who.id, askerName: asker === null ? null : text(asker.name) }
  }
  return null
}
