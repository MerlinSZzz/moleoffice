// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORKERS A SUPERVISOR IN A SANDBOX ASKS THE OFFICE TO START, THROUGH THE DOOR OR BY HAND. Wave 13j round loop-3 (step 3 of
 * "a supervisor runs its own loop", block wUDMYyLGLvfq of pipeline UPsmFdztY5Xf). A supervisor starts its own
 * workers, and the office only reminds how many it started, as option B of a decision says.
 *
 * The ask is `POST /api/agents/<worker>/worker-run` {brief}, made by the supervisor with the key of its own run in a
 * sandbox. src/server/lib/worker-runs.ts checks it and keeps it on that run, under `workerRuns`, one entry for each
 * worker by its registry id. The message worker on the host starts the worker with `node tools/sandbox.mjs worker
 * --parent <the supervisor's run>`, because Claude Code cannot be started from inside a sandbox. The launcher files the
 * worker's run as a child of the supervisor's run, and the office mints its key on that create.
 *
 * The ask may also name a runtime and a model (wave 13j round loop-6), which one Casting row of the worker card in force
 * for the project must cast (wave 13n round BQ). The ask keeps that row, or the row its roll chose, as it read it, and
 * the start reads the row again. A dsh or OpenCode worker, chosen or rolled from the Casting table (round 46), is started
 * with `exec --agent` in its own worktree, because the launcher's `worker` command takes claude-code and codex only.
 *
 * THE COMMIT THE WORKER'S WORKTREE IS CUT FROM (wave 13j, the round after loop-10). The ask chooses it: by default the
 * commit the asking run's own worktree stands at, read when it asks, or a branch or commit the ask names as `cutFrom`.
 * Either must be a commit of the sandbox's repository that a branch or tag there reaches. The cut is used only when the
 * worker's worktree is made at the start. A worktree that is there already is used as it stands, and a cut the ask
 * named is then refused, unless the gate `worker-cuts-the-sandbox-cannot-use` is off. The worker's run keeps which commit was asked and whether it was used, under `cutAsked`. An
 * ask that names one of the sandbox's clones beside repo/ as `clone` has its cut looked for in that clone only, and the
 * cut keeps the clone's name, so the launcher is given `--clone` (wave 13j, the clone round).
 *
 * A hand ask at /hand-run carries --asked-by and --brief, keeps byHand:true directly as starting, and has no
 * launcher wrapper. Filing uses the same cut and started fields, so the asker readers read both paths alike.
 *
 * Each door entry moves through the four states of a next round (src/shared/next-round.ts), each written by the office alone:
 *   - wanted    the ask is kept, and nothing has started;
 *   - starting  the worker filed its launcher run (`starting.wrapper`) and is starting the launcher;
 *   - started   the launcher filed the worker's run (`started.run`), and the office minted its key;
 *   - failed    nothing was started, and `failed.says` says why.
 *
 * Here and not on the server so the door, the worker, the parent rule and a page read one shape.
 */

import type { THE_PROGRAM_A_RUNTIME_RUNS } from '../config/launcher-selection.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../config/runtime-native-providers.mjs'
import type { CastingRow } from './casting.ts'
import type { CastingRollRecord } from './casting-roll.ts'
import { ROUND_LAUNCHER_RUNTIME, type TheEffortTheLauncherIsAnswered } from './next-round.ts'
import type { ParticipantRef } from './participants.ts'

export const WORKER_RUNS = 'workerRuns'
export const FOR_THE_PERSON = 'For the person: a worker is safest in a sandbox. A copy, such as a worktree or a copied folder, is next. Working straight in your own checkout carries some risk. Outside a sandbox, a worker can read everything your account can read, the office\'s key too.'
export const HOST_DEFAULT_PERMISSIONS = 'The runtime runs with its own default permissions and may not be able to write or commit unless your settings for it allow it.'
export const WORKER_PLACE = 'workerPlace'
export const ONLY_THE_OFFICE_WRITES_THE_WORKER_PLACE = "Only the office writes where a worker's run works, when it is filed for an ask. Nothing was written."

export type TheWorkerPlace =
  | { kind: 'worktree'; folder: string; repository: { name: string; root: string } }
  | { kind: 'folder'; folder: string; repository: { name: string; root: string } | null }
export type TheWorkerPlaceAsked =
  | { kind: 'worktree'; repository: string; folder: string }
  | { kind: 'folder'; folder: string }

/** The refusal of `workerRuns` in any write but the office's own, on a create and on a patch. */
export const ONLY_THE_OFFICE_WRITES_THE_WORKER_RUNS =
  "Only the office writes a run's worker runs, at POST /api/agents/<agent>/worker-run. Nothing was written."

export const CUT_ASKED = 'cutAsked'

/** The refusal of `cutAsked` in any write but the office's own, on a create and on a patch. */
export const ONLY_THE_OFFICE_WRITES_THE_CUT_ASKED =
  "Only the office writes which commit a worker's run was asked to be cut from, when the run is filed for an ask made at POST /api/agents/<agent>/worker-run. Nothing was written."

/**
 * WHICH COMMIT A WORKER'S RUN WAS ASKED TO BE CUT FROM, AND WHETHER IT WAS, kept on the worker's own run by the office
 * when the run is filed. `stoodAt` is the commit the run was filed at, which the launcher read from its worktree, or
 * null when the run names none.
 */
export interface TheCutAsked {
  /** The commit the ask chose. */
  commit: string
  /** The branch or commit the ask named, or null because it named none and the asking run's own commit was taken. */
  named: string | null
  /** Whether the launcher was given the commit to make the worktree at: false when the worktree was there already. */
  used: boolean
  stoodAt: string | null
  says: string
}

export const IMAGES_GIVEN = 'imagesGiven'

/** The refusal of `imagesGiven` in any write but the office's own, on a create and on a patch. */
export const ONLY_THE_OFFICE_WRITES_THE_IMAGES_GIVEN =
  "Only the office writes which images a worker's run was given, when the run is filed for an ask made at POST /api/agents/<agent>/worker-run. Nothing was written."

/**
 * THE IMAGES A CODEX WORKER'S RUN WAS GIVEN AT ITS START, kept on the worker's own run by the office when the run is
 * filed for an ask that named them. `images` are the paths in the worker's worktree `worktree`, in the order the ask
 * named them, and the launcher gave codex exec each one as -i.
 */
export interface TheImagesGiven {
  images: string[]
  worktree: string
  says: string
}

export const WORKER_PACKAGE = 'workerPackage'

/**
 * THE PACKAGE A WORKER START NAMED, kept on the supervisor's ask under `package` and copied onto the worker's own run
 * under `workerPackage` by the office when the run is filed. The points are the package's own points the worker was
 * given, and `why` is one sentence saying why this worker was given them. `askedAt` is the ask's own moment, so a day's
 * read finds the package by the ask rather than by when the worker's run happened to be filed.
 */
export interface TheWorkerPackage {
  /** The packaged task this worker was given. Its title is read live from the task and never stored here. */
  task: string
  points: string[]
  /**
   * The difficulty the ask named, or the one its brief marks: a Casting label, kept as the label's own word. No list
   * of difficulty words is kept beside it, so a label the Casting table gains needs no change here.
   */
  difficulty: string
  why: string
  askedAt: string
}

/** Read a stored package field, or null when it is not one. */
export function readTheWorkerPackage(value: unknown): TheWorkerPackage | null {
  if (!isObject(value) || !isText(value['task'])) return null
  const points = value['points']
  const difficulty = value['difficulty']
  if (!Array.isArray(points) || points.length === 0 || !points.every(isText)) return null
  if (!isText(difficulty)) return null
  if (!isText(value['why']) || !isText(value['askedAt'])) return null
  return value as unknown as TheWorkerPackage
}

/** The package a worker start named, with the task's live title, as a run's page draws it. */
export interface ThePackageAWorkerWasGiven extends TheWorkerPackage {
  title: string | null
}

/** The refusal of `workerPackage` in any write but the office's own, on a create and on a patch. */
export const ONLY_THE_OFFICE_WRITES_THE_WORKER_PACKAGE =
  "Only the office writes which package a worker's run was started for, when the run is filed for an ask made at POST /api/agents/<agent>/worker-run. Nothing was written."

/** What the worker's launcher run is for, in its `extra.purpose`. Its runtime is the round launcher's. */
export const A_WORKER_LAUNCHER_PURPOSE = 'worker'

export const WORKER_RUN_STATES = ['wanted', 'starting', 'started', 'failed'] as const
export type WorkerRunState = (typeof WORKER_RUN_STATES)[number]

/** A runtime the launcher starts a worker on: one it has a command for. A Casting row with another program is refused. */
export type AChosenRuntime = keyof typeof THE_PROGRAM_A_RUNTIME_RUNS

/**
 * THE CASTING ROW A WORKER IS GIVEN, AS THE ASK READ IT (wave 13n round BQ): the row a choice names, or the row the
 * ask's roll chose. A row with native selection data is held to its selection revision, which every change to such a
 * row renews. A row with none is held to its program, model and effort, and `revision` is null; such a row that gains
 * native data has changed too.
 */
export interface TheRowAWorkerIsGiven {
  id: number
  revision: string | null
  program: string
  model: string
  effort: string | null
}

/** The provider the launcher adds in front of a model for this runtime, or null: only Codex's, from the data file. */
export function theProviderTheLauncherAdds(runtime: string): string | null {
  return runtime === 'codex' ? THE_PROVIDER_A_RUNTIME_RUNS[runtime] ?? null : null
}

/**
 * THE MODEL THE LAUNCHER IS GIVEN for a choice, a rolled Casting row, or a builder's Casting row or own model from the
 * run-model door: a Codex model as `<the provider the data file names>/<model>`, the only name the launcher's worker
 * command takes (wave 13n round AG, and items 2ac and 2ae). A Codex model already named under that provider is given as
 * it is. An OpenCode model keeps its provider.
 */
export function theModelTheLauncherIsGiven(chosen: { runtime: string; model: string }): string {
  const provider = theProviderTheLauncherAdds(chosen.runtime)
  return provider !== null && !chosen.model.startsWith(`${provider}/`) ? `${provider}/${chosen.model}` : chosen.model
}

/**
 * The row as the ask read it, kept on the entry: a native row by its selection revision, and any row by its cells. A
 * worker run's ask and a next round's ask keep it alike.
 */
export function theRowAsTheAskReadIt(row: Pick<CastingRow, 'id' | 'cells' | 'native' | 'selectionRevision'>): TheRowAWorkerIsGiven {
  return {
    id: row.id,
    revision: row.native == null ? null : row.selectionRevision ?? null,
    program: row.cells.program.value!,
    model: row.cells.model.value!,
    effort: row.cells.effort.value,
  }
}

/**
 * THE RUNTIME AND THE MODEL THE LAUNCHER IS GIVEN for a kept row: a native row's program and Office model, which its
 * selection is for, or else the choice or the roll by theModelTheLauncherIsGiven, so a roll and a choice reach it alike
 * (wave 13n round AG). The ask says it and the start gives it, by this one rule.
 */
export function theStartOfTheRow(row: TheRowAWorkerIsGiven, named: { runtime: string; model: string }): { runtime: string; model: string } {
  return row.revision !== null ? { runtime: row.program, model: row.model } : { runtime: named.runtime, model: theModelTheLauncherIsGiven(named) }
}

export interface TheWorkerRun {
  state: WorkerRunState
  /** A hand ask, kept directly as starting; the message worker must not launch it. */
  byHand?: true
  askedAt: string
  /** The supervisor, proved by its own key, and the run it asked from. */
  askedBy: { who: ParticipantRef; session: string }
  /** The worker's handle when it was asked for. */
  handle: string
  /**
   * The package this start named, with its points, difficulty and why. Absent on an ask made before the package account,
   * and on an ask that names none; the account draws both as naming none.
   */
  package?: TheWorkerPackage
  /** The brief, as a pointer and a hash: an absolute path inside the sandbox folder, its sha256 and its size. */
  brief: { path: string; sha256: string; bytes: number }
  /** The sandbox the supervisor's run was started in, as the office vouches for it. The worker starts in it too. */
  sandbox?: { folder: string; instance: string; container: string }
  place?: TheWorkerPlace
  /** The ask this one replaced, when one was still waiting. */
  replaced?: { askedAt: string }
  /**
   * The runtime and the model the ask chose, as named, and who chose them. Absent when the ask named neither, and the
   * Casting row for the worker card is given.
   */
  chosen?: { runtime: AChosenRuntime; model: string; by: ParticipantRef }
  /**
   * The Casting row the worker is given, as the ask read it: the one row of the worker card in force for the project
   * that casts the choice, or the row the roll chose. The start reads it again and fails when it changed, was held or was
   * removed. Absent on an ask made before wave 13n round BQ, which the start fails.
   */
  row?: TheRowAWorkerIsGiven
  /**
   * How the default router chose the Casting row for the worker card at the ask, when the ask named neither (round 46).
   * The start reads this record and does not ask the router again, so the ask and the start give one row. On an ask with
   * a choice it is the roll an earlier ask on this entry made, kept unused until an ask that names nothing takes it
   * (round 47), and absent when there was none. Absent on an ask made before round 46.
   */
  castingRoll?: CastingRollRecord
  /**
   * The commit the worker's worktree is to be cut from: the branch or commit the ask named, resolved, or else the commit
   * the asking run's own worktree stood at when it asked (`named` null). Absent on an ask made before the ask chose one.
   * `clone` is the sandbox's clone the ask named, by the name instance.json lists it under, and is absent for repo/.
   */
  cut?: { commit: string; named: string | null; clone?: string }
  /**
   * The paths the ask named that the worker needs, which the start gives the launcher as `--with-path` each, so they are
   * checked out in its worktree even when the sandbox's template leaves them out of a worker's. Absent when it named none.
   */
  paths?: string[]
  /**
   * The files of the worker's worktree the ask named as images, which the start gives the launcher as `--image` each, so
   * codex exec is given each as -i. Only a codex worker is given any. Absent when it named none.
   */
  images?: string[]
  /**
   * What the launcher was given: the ask's choice, a Codex model under the provider the data file names, or else the runtime and the model of
   * the Casting row the ask's roll chose for the worker card, which `casting` and `castingSays` then name, and how it
   * chose (`castingRoll`, copied onto the worker's run when the run is filed; absent before round 44). And the effort the
   * office answers the launcher for that runtime and model, from the rolled row or the marked Casting row only when that
   * row casts one. `cutFrom` is the commit the launcher was given to make the worker's worktree at, or null because the
   * worktree was there already and is used as it stands, which `cutSays` says; both absent before the ask chose a cut.
   */
  starting?: {
    at: string
    wrapper?: string
    runtime?: string
    model?: string
    casting?: number
    castingSays?: string
    castingRoll?: CastingRollRecord
    cutFrom?: string | null
    cutSays?: string
  } & Partial<TheEffortTheLauncherIsAnswered>
  started?: { at: string; run: string; runKeyId: string }
  /** How the launcher ended, once it has. */
  launcher?: { at: string; ok: boolean; says: string }
  /** The worker's open process row when the launcher ended, or null with why none was found. */
  process?: { row: string | null; says: string }
  failed?: { at: string; says: string }
}

const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Read one stored entry of `workerRuns`, or null when it is not one. */
export function readTheWorkerRun(value: unknown): TheWorkerRun | null {
  if (!isObject(value) || !WORKER_RUN_STATES.includes(value['state'] as WorkerRunState) || !isText(value['askedAt']) || !isText(value['handle'])) return null
  const askedBy = value['askedBy']
  const brief = value['brief']
  const sandbox = value['sandbox']
  const place = value['place']
  if (!isObject(askedBy) || !isObject(askedBy['who']) || !isText(askedBy['who']['id']) || !isText(askedBy['session'])) return null
  if (!isObject(brief) || !isText(brief['path']) || !isText(brief['sha256']) || typeof brief['bytes'] !== 'number') return null
  if ((sandbox === undefined) === (place === undefined)) return null
  if (sandbox !== undefined && (!isObject(sandbox) || !isText(sandbox['folder']) || !isText(sandbox['instance']) || !isText(sandbox['container']))) return null
  if (place !== undefined) {
    if (!isObject(place) || !isText(place['folder']) || (place['kind'] !== 'worktree' && place['kind'] !== 'folder')) return null
    const repository = place['repository']
    if (repository === null) { if (place['kind'] !== 'folder') return null }
    else if (!isObject(repository) || !isText(repository['name']) || !isText(repository['root'])) return null
  }
  return value as unknown as TheWorkerRun
}

/** The entry a run's data keeps for one worker, by its registry id, or null when it keeps none that reads. */
export function theWorkerRunOn(data: Record<string, unknown>, agentId: string): TheWorkerRun | null {
  const all = data[WORKER_RUNS]
  return isObject(all) && Object.hasOwn(all, agentId) ? readTheWorkerRun(all[agentId]) : null
}

/**
 * WHETHER THE OFFICE IS STARTING THIS WORKER UNDER THIS LAUNCHER RUN, as a run's data says. The parent rule in
 * src/server/lib/records.ts asks it before the office's key may name the supervisor's run as the worker's parent, and
 * the run-key door asks it again before it mints the worker's key.
 */
export function aWorkerRunIsStartingUnder(data: Record<string, unknown>, agentId: string, wrapper: string): boolean {
  const asked = theWorkerRunOn(data, agentId)
  return asked !== null && asked.state === 'starting' && asked.starting?.wrapper === wrapper
}

/**
 * WHETHER A RUN'S DATA IS THE LAUNCHER RUN THE OFFICE FILED FOR THIS WORKER UNDER THIS SUPERVISOR'S RUN: the round
 * launcher's runtime, filed by the office, for a worker, naming both. The starting door, the parent rule and the run-key
 * door each ask it, so the three take one launcher.
 *
 * THE WORKER IS COMPARED BY CANONICAL ID. A launcher filed before the re-mint names its worker by the old id, and a
 * supervisor that kept the old id while the office was closed asks by it. `canonicalOf` reads an id through its filed
 * alias, so the stored id and the id asked are read the same way before they are compared.
 */
export function theLauncherIsForThisWorkerRun(data: Record<string, unknown>, run: string, agentId: string, canonicalOf: (id: string) => string): boolean {
  const extra = data['extra']
  return (
    data['runtime'] === ROUND_LAUNCHER_RUNTIME &&
    data['startedByMoleOffice'] === true &&
    isObject(extra) &&
    extra['purpose'] === A_WORKER_LAUNCHER_PURPOSE &&
    extra['run'] === run &&
    typeof extra['worker'] === 'string' &&
    canonicalOf(extra['worker']) === canonicalOf(agentId)
  )
}

/**
 * ONE WORKER A SUPERVISOR'S RUN ASKED FOR, AS A PAGE DRAWS IT. Wave 13j round loop-4, item 0: Normal mode drew nothing
 * of `workerRuns`, and Developer mode drew it only as stored JSON. `theWorkersARunStarted` in
 * src/server/lib/worker-runs.ts reads each entry with `readTheWorkerRun` and reads the worker's own run beside it, so
 * the page works nothing out of its own.
 */
export interface AWorkerARunAskedFor {
  /** The worker's registry id, which its entry is kept under. */
  agent: string
  /** The name the registry gives the worker, or null when the registry holds none. */
  name: string | null
  /** The worker's handle when it was asked for. */
  handle: string
  /** The ask's own state. */
  asked: WorkerRunState
  /** Why nothing was started, on a failed ask that says, and null on every other. */
  failedSays: string | null
  /** The model the office gave the worker's launcher, chosen in the ask or from its Casting row, or null before the launcher was given one. */
  modelGiven: string | null
  /** The package this ask named and the task's live title, or null because it named none. */
  package: ThePackageAWorkerWasGiven | null
  /** The worker's run the launcher filed, or null before it filed one. */
  runId: string | null
  /** That run as this project holds it, or null when there is no run or it is not a live run in this project. */
  run: {
    title: string
    /** The run's own state, or null when it stores none. */
    state: string | null
    /**
     * The next try of a running run waiting more than an hour on a usage limit, which the page draws in place of the
     * state word (src/config/a-long-wait.mjs). Absent when the run holds no such wait.
     */
    waitsLongUntil?: string
    /** The model the run was registered for, or null when it stores none. */
    model: string | null
    /** Whether the office kept a seal on the run. */
    sealed: boolean
    /** The run's usage receipt, with the cost it gives or null when it gives none; null when the run has no receipt. */
    receipt: { costUsd: number | null } | null
  } | null
}

/** The workers one run asked for, oldest ask first, and how many kept entries did not read as one. */
export interface TheWorkersARunStarted {
  workers: AWorkerARunAskedFor[]
  /** Entries under `workerRuns` that do not read as an ask, counted so that none is left out without a word. */
  unreadable: number
}

/**
 * THE SUPERVISOR'S RUN THAT ASKED FOR A WORKER'S RUN, AS A PAGE DRAWS IT. Wave 13j round loop-5, item 2: the worker's own
 * run said nothing of who asked for it. `theRunThatAskedForThisWorker` in src/server/lib/worker-runs.ts reads it, and
 * only from the parent's own `workerRuns`, because every continued run has a parent too.
 */
export interface TheRunThatAskedForAWorker {
  /** The supervisor's run, by its id. */
  run: string
  title: string
  /** Who asked, as its entry keeps it: the stored id, and the name the registry gives it or null when it holds none. */
  askerId: string
  askerName: string | null
}
