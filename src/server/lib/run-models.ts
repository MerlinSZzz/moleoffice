// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { selectionOfACasting } from './the-casting-in-force.ts'
import { aCastingById } from './a-casting-by-id.ts'
import { aProviderRefusal, theProviderACheckTakes } from './the-provider-a-check-takes.ts'
import type { TheProviderACheckTakes } from '@shared/the-provider-table.ts'
import { theProviderRouterIsOn } from '../../config/provider-router.mjs'
/**
 * THE MODEL A RUN GETS: ONE READER, AND THE TWO WRITERS BEHIND THE SETTINGS PAGE. Criterion U2.
 *
 * -----------------------------------------------------------------------------------------
 * THE LAYERS, FIRST MATCH WINS
 * -----------------------------------------------------------------------------------------
 *
 *   a. the agent's own model, on its record beside its runtime (set on its profile);
 *   b. for a run answering a message, the Settings page's choice; for a builder, the casting the
 *      tools take for its role card; for a check, the casting the tools take for the inspector card
 *      (lib/casting.ts), as two decisions say: the marked
 * casting of the project
 *      asked about if that project has castings of the role, else the marked every-project casting;
 *   c. what the run gets from .env, read through the readers in src/config and never again here.
 *      The office ships no default model, as FLO-05 of a decision says, so
 * with nothing set this
 *      layer names none, `from` is `none`, and `says` ends with the sentence from NO_MODEL_SAYS that
 *      says where a model is named. Whoever starts the run refuses it.
 *
 * A CODEX RUN ANSWERING A MESSAGE READS NO .env, and never Codex's own configuration. In place of layer
 * c it takes its agent's Casting row in force, when that row is for Codex and holds a model, a native
 * model and an effort, with the row's selection. Otherwise the answer has no model, `refused` names the
 * agent, what the row lacks and the Casting page, and every door that starts a run refuses it.
 *
 * A stored choice is tied to a runtime, because a model name means something only to the runtime
 * it was written for. A choice for another runtime than the run's does not apply, and neither does
 * a Casting model whose row names no program: the reader goes on to the next layer and `says` so.
 * Passing it on would be the product inventing a fact. A Casting row's effort goes with its model
 * to a check as `variant`, and the check tool passes it to Claude Code (wave 13v round 27). A row with native data gives
 * its selection to a conversation, a builder or a check whose program and model are the row's; a held row gives none,
 * and the answer names the hold.
 * Effort is read from the agent's own record, then a matching Casting row, then the owner's rule
 * for the answered model. Builder starts pass that effort too.
 *
 * NOTHING IS CACHED. Every answer reads the store, the Casting table, the agent's record and its role
 * card again, so a press on the Settings page or the Casting page reaches the next run.
 *
 * -----------------------------------------------------------------------------------------
 * WHO READS IT
 * -----------------------------------------------------------------------------------------
 *
 * `theQueue` in lib/worker.ts, for a run answering a message and for a check; the Runtime page,
 * through `whereRunsGo`; and the doors in api/run-models.ts, which tools/agent-worker.mjs,
 * tools/the-inspector.mjs and tools/sandbox-start.mjs ask when no `--model` was given.
 */
import { THE_INSPECTOR, cardFor } from '@shared/roles.ts'
import {
  NOTICES_START_NO_RUN,
  RUN_MODEL_PLACES,
  THE_CHECKS_RUNTIME,
  readRunModels,
  theSlotInWords,
  whyThisPairIsRefused,
  type AnAgentsRunModel,
  type RunModelPair,
  type RunModelSettings,
  type RunModelSlotReading,
  type RunModelsReading,
  type TheModelARunGets,
  type TheNoSelection,
  type TheRowAMessageRunKeeps,
} from '@shared/run-models.ts'
import { AGENT_RUNTIMES, THE_RUNTIMES_THE_OFFICE_DISPATCHES, runtimeShownName } from '@shared/participants.ts'
import type { CastingRow } from '@shared/casting.ts'
import type { EarlierCastingRoll } from '@shared/casting-roll.ts'
import { underTheRaise } from '@shared/renamed-words.ts'
import { nowStamp } from '@shared/time.ts'
import { mergedEnvironment, readSetting } from '../../config/settings.mjs'
import { NO_MODEL_SAYS, theModelIn, whereTheModelCameFrom } from '../../config/agent-model.mjs'
import {
  choreModelIn,
  choreRuntimeIn,
  choreVariantIn,
  theModelAChoreIsGiven,
  whereTheChoreModelCameFrom,
  whereTheChoreRuntimeCameFrom,
} from '../../config/chores.mjs'
import { saying, inEnglish, allInEnglish, type DevSaying } from '@shared/dev-sayings.ts'
import { whereTheChoreCameFromSaid, whereTheModelCameFromSaid } from '@shared/where-a-run-model-came-from.ts'
import { inspectionSettings } from '../../config/inspection.mjs'
import { sqlite } from '../db/client.ts'
import { keptStatement } from '../db/kept-statement.ts'
import { agentsWithTheseIds } from '../db/agents-with-these-ids.ts'
import { theModelOnTheAgentRecord } from '../db/the-model-on-the-agent-record.ts'
import { theRoleOnTheAgentRow } from '../db/the-role-on-the-agent-row.ts'
import type { Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { theRoleCards } from './roles.ts'
import { theCastingInForce } from './the-casting-in-force.ts'
import { theRowsInForce } from './the-rows-in-force.ts'
import { aNameNamesTheSelection } from '../../config/launcher-selection.mjs'
import { theEarlierCastingRoll } from './casting-roll.ts'
import { theModelTheLauncherIsGiven, theProviderTheLauncherAdds, theRowAsTheAskReadIt, type TheRowAWorkerIsGiven } from '@shared/worker-runs.ts'
import { theOwnersEffort, withoutTheProvider } from '../../config/model-efforts.mjs'
import { theRuntimesTheWorkerGives } from '../../worker/runtimes/what-a-runtime-passes-on.ts'

/**
 * Which runtimes the message worker passes a model and an effort to. It is worked out once from what each runtime the
 * office dispatches passes on, and that is written in the one file this server loads from src/worker/runtimes.
 */
export const THE_WORKER_GIVES = theRuntimesTheWorkerGives(THE_RUNTIMES_THE_OFFICE_DISPATCHES)

/** Where a run is started: the two places the office starts one by itself, or a builder. */
export type RunPlace = 'conversation' | 'check' | 'builder'

/** What the store holds, and who last wrote it. `settings` undefined means no row: nobody set anything. */
interface Stored {
  settings: RunModelSettings | undefined
  updatedAt: string | null
  updatedBy: { kind: string; id: string } | null
}

/**
 * ONE PREPARED STATEMENT PER DATABASE HANDLE (wave 13y round 42). `theModelARunGets` reads the store once for each
 * recipient of the queue's pass. On the made-up database of the live size, building and preparing this same statement
 * again took about 56 ms per process, of the about 81 ms under `theStore` and the about 374 ms under `theModelARunGets`.
 * The statement still reads the row as it is whenever it runs, so a press on the Settings page reaches the next run.
 */
const theStoredChoices = keptStatement(() =>
  sqlite.prepare('SELECT settings, updated_at, updated_by_kind, updated_by_id FROM run_models WHERE only_row = 1'),
)

function theStore(): Stored {
  const held = theStoredChoices().get() as { settings: string; updated_at: string; updated_by_kind: string; updated_by_id: string } | undefined
  if (held === undefined) return { settings: undefined, updatedAt: null, updatedBy: null }
  return {
    settings: readRunModels(JSON.parse(held.settings), THE_WORKER_GIVES),
    updatedAt: held.updated_at,
    updatedBy: { kind: held.updated_by_kind, id: held.updated_by_id },
  }
}

function isIn(list: readonly string[], word: string | null): boolean {
  return word !== null && list.includes(word)
}

/**
 * The declared card an agent's own row names, or null when no declared card has that name. It reads
 * only the role, from the kept agent-row statement (wave 13y round 44); building the whole
 * participant ran the record's runtime statement once per card read for an answer that never uses it.
 */
function theCardOf(agentId: string): string | null {
  return cardFor(theRoleCards(), theRoleOnTheAgentRow(agentId).role)?.name ?? null
}

/** The role card whose Casting row in force an answer reads: the inspector's for a check, else the one asked or the agent's. */
function theCardAnAnswerReads(asked: Asked): string | null {
  return asked.place === 'check' ? THE_INSPECTOR : asked.role ?? (asked.agentId === null ? null : theCardOf(asked.agentId))
}

/**
 * WHAT EACH NO-SELECTION REASON SAYS, written once. A test imports these rather than copying a sentence
 * (tests/run-models-says-why-it-gives-no-selection.test.ts). The reason words are in
 * src/shared/run-models.ts, NO_SELECTION_REASONS.
 */
export const NO_SELECTION_SAYS = {
  noModel: () => 'Nothing names a model for this run, so there is no selection.',
  runtimeTakesNoModel: (runtime: string, row: number | null) =>
    `The office passes ${runtimeShownName(runtime)} no model when it answers a message, so ` +
    (row === null ? 'there is no selection.' : `Casting row ${String(row)} cannot give this run a selection.`),
  noRow: (card: string) => `The Casting table has no row in force for ${card}, so there is no selection.`,
  noRoleCard: () => 'No role card names a Casting row for this run, so there is no selection.',
  rowNamesNoModel: (row: number) => `Casting row ${String(row)} names no model, so there is no selection.`,
  rowNamesNoProgram: (row: number) => `Casting row ${String(row)} names a model and no program, so there is no selection.`,
  rowHasNoNative: (row: number) => `Casting row ${String(row)} has no native selection data, so there is no selection.`,
  // A NULL RUNTIME HERE IS A RUN THAT NOTHING NAMES A PROGRAM FOR. An agent whose record names a harness the office has
  // no adapter for never comes here: its answer is the sentence that the harness chooses its model itself.
  rowForAnotherProgram: (row: number, program: string, runtime: string | null) =>
    `Casting row ${String(row)} is for ${runtimeShownName(program)}, and this run is on ` +
    `${runtime === null ? 'a program nothing names' : runtimeShownName(runtime)}, so there is no selection.`,
  modelNotTheRows: (row: number, model: string) => `Casting row ${String(row)} does not name model ${model}, so there is no selection.`,
} as const

/**
 * WHY AN ANSWER WITH NO SELECTION HAS NONE. `row` is the row the selection would have come from, or null;
 * `cast` is the row in force, which is still the row to name when nothing else would give a selection.
 * Only called when no hold, ambiguity or refusal already says why, and never for a harness that chooses its model itself.
 */
function whyThereIsNoSelection(
  model: string | null,
  runtime: string | null,
  card: string | null,
  cast: Pick<CastingRow, 'id' | 'cells' | 'native'> | null,
  row: Pick<CastingRow, 'id' | 'cells' | 'native'> | null,
  place: RunPlace,
): TheNoSelection {
  if (model === null) {
    if (place === 'conversation' && runtime !== null && !isIn(THE_WORKER_GIVES.aModelTo, runtime)) {
      return { reason: 'runtime-takes-no-model', castingRow: cast?.id ?? null, says: NO_SELECTION_SAYS.runtimeTakesNoModel(runtime, cast?.id ?? null) }
    }
    if (cast === null) {
      return card === null
        ? { reason: 'no-model', castingRow: null, says: NO_SELECTION_SAYS.noModel() }
        : { reason: 'no-row', castingRow: null, says: NO_SELECTION_SAYS.noRow(card) }
    }
    if (cast.cells.model.value === null) return { reason: 'row-names-no-model', castingRow: cast.id, says: NO_SELECTION_SAYS.rowNamesNoModel(cast.id) }
    if (cast.cells.program.value === null) return { reason: 'row-names-no-program', castingRow: cast.id, says: NO_SELECTION_SAYS.rowNamesNoProgram(cast.id) }
    return {
      reason: 'row-for-another-program',
      castingRow: cast.id,
      says: NO_SELECTION_SAYS.rowForAnotherProgram(cast.id, cast.cells.program.value, runtime),
    }
  }
  if (row === null) {
    return card === null
      ? { reason: 'no-role-card', castingRow: null, says: NO_SELECTION_SAYS.noRoleCard() }
      : { reason: 'no-row', castingRow: null, says: NO_SELECTION_SAYS.noRow(card) }
  }
  if (row.cells.model.value === null) return { reason: 'row-names-no-model', castingRow: row.id, says: NO_SELECTION_SAYS.rowNamesNoModel(row.id) }
  if (row.native == null) return { reason: 'row-has-no-native', castingRow: row.id, says: NO_SELECTION_SAYS.rowHasNoNative(row.id) }
  if (row.cells.program.value === null) return { reason: 'row-names-no-program', castingRow: row.id, says: NO_SELECTION_SAYS.rowNamesNoProgram(row.id) }
  if (row.cells.program.value !== runtime) {
    return { reason: 'row-for-another-program', castingRow: row.id, says: NO_SELECTION_SAYS.rowForAnotherProgram(row.id, row.cells.program.value, runtime) }
  }
  return { reason: 'model-not-the-rows', castingRow: row.id, says: NO_SELECTION_SAYS.modelNotTheRows(row.id, model) }
}

/**
 * THE CASTING ROW IN FORCE THAT A BUILDER RUN OF AN AGENT READS, with the card it is the row of: the row layer b of
 * `modelAnswer` reads for a builder. The next round's door reads it here, so a round takes the row a builder run takes
 * (wave 13n round BJ).
 */
export function theCastingRowABuilderReads(agentId: string, project: string): { card: string | null; row: ReturnType<typeof theCastingInForce> } {
  const card = theCardOf(agentId)
  return { card, row: card === null ? null : theCastingInForce(card, project) }
}

/**
 * THE HOLD ON A ROW, in the sentence lib/casting.ts makes for it without its ending, or null because the row is not
 * held. Only a row with native selection data is held, after its native refusal.
 */
export function theHoldOn(row: Pick<CastingRow, 'id' | 'cells' | 'native' | 'hold' | 'selectionRevision'>): string | null {
  if (row.native == null || row.hold == null) return null
  try {
    selectionOfACasting(row)
  } catch (error) {
    if (error instanceof PanelError && error.status === 409) return error.message.replace(/ Nothing was started\.$/, '')
    throw error
  }
  throw new Error(`Casting row ${String(row.id)} is held, and its selection was read anyway.`)
}

/**
 * THE ROW THE ASK KEPT, AT THE START, read again: the same row, as the ask read it, or why not in words. A native row
 * must be at the revision the ask read, and not held. A row with no native data must cast what the ask read and still
 * have no native data, so a probability or a mark may change. No other row is taken and nothing is rolled again. A
 * worker run's start and a next round's start read it alike; `read` is the row as it reads now. A message run's start
 * reads the row its queue read the same way, and its sentences say that the queue read it.
 */
export function theKeptRowAtTheStart(
  kept: TheRowAWorkerIsGiven | undefined,
  by: 'the ask' | 'the queue' = 'the ask',
): { ok: true; row: TheRowAWorkerIsGiven; read: CastingRow } | { ok: false; says: string } {
  if (kept === undefined) return { ok: false, says: 'The ask keeps no Casting row, because it was made before an ask kept one. Ask again.' }
  const which = by === 'the ask' ? 'which the ask chose' : 'which the queue read for this message run'
  const after = by === 'the ask' ? 'after the ask chose it' : 'after the queue read it'
  let row: CastingRow
  try {
    row = aCastingById(kept.id)
  } catch (error) {
    if (error instanceof PanelError && error.status === 404) return { ok: false, says: `Casting row ${String(kept.id)}, ${which}, is no longer in the table.` }
    throw error
  }
  const held = theHoldOn(row)
  if (held !== null) return { ok: false, says: held }
  const notSwapped = 'It is not swapped for another row and not rolled again.'
  if (kept.revision !== null || row.native != null) {
    return kept.revision !== null && row.native != null && row.selectionRevision === kept.revision
      ? { ok: true, row: kept, read: row }
      : { ok: false, says: `Casting row ${String(kept.id)} changed ${after}: its native selection is not the one ${by} read. ${notSwapped}` }
  }
  const casts = (program: string | null, model: string | null, effort: string | null): string =>
    `${program ?? 'no program'} with the model ${model ?? 'no model'} and ${effort === null ? 'no effort' : `the effort ${effort}`}`
  const now = { program: row.cells.program.value, model: row.cells.model.value, effort: row.cells.effort.value }
  if (now.program === kept.program && now.model === kept.model && now.effort === kept.effort) return { ok: true, row: kept, read: row }
  return {
    ok: false,
    says:
      `Casting row ${String(kept.id)} changed ${after}: ${by} read ${casts(kept.program, kept.model, kept.effort)}, and it now ` +
      `casts ${casts(now.program, now.model, now.effort)}. ${notSwapped}`,
  }
}

/**
 * WHETHER A MESSAGE RUN'S START WOULD READ ANOTHER CASTING ROW THAN ITS QUEUE KEPT: the sentence that says so, or null
 * because the start reads the row the queue read, or no row where the queue read none. Either side may be no row.
 */
export function theRowAStartLeaves(kept: TheRowAWorkerIsGiven | null, now: TheRowAMessageRunKeeps | undefined): string | null {
  const read = now?.row?.id ?? null
  if ((kept?.id ?? null) === read) return null
  const aRow = (id: number | null) => (id === null ? 'no Casting row' : `Casting row ${String(id)}`)
  return `The queue read ${aRow(kept?.id ?? null)} for this message run, and its start would read ${aRow(read)}. The run is not moved to the other row.`
}

/** What a Casting row in force lacks to start a Codex run, in a sentence, or null because it lacks nothing. */
function whatACodexRowLacks(row: ReturnType<typeof theCastingInForce>, role: string): DevSaying | null {
  if (row === null) return saying('castingNoRowInForce', { role })
  const program = row.cells.program.value
  if (program === null) return saying('castingRowNoProgram', { row: String(row.id) })
  if (program !== 'codex') return saying('castingRowForAnotherProgram', { row: String(row.id), program: runtimeShownName(program) })
  if (row.cells.model.value === null) return saying('castingRowNoModel', { row: String(row.id) })
  if (row.native == null) return saying('castingRowNoNativeModel', { row: String(row.id) })
  if (row.cells.effort.value === null) return saying('castingRowNoEffort', { row: String(row.id) })
  return null
}

/** Layer c: what the run gets from .env, through the src/config readers. */
function fromTheSettingsFile(
  place: RunPlace,
  runtime: string | null,
  env: NodeJS.ProcessEnv,
): { model: string | null; variant: string | null; says: string; said: DevSaying[] } {
  const nothingSet =
    place === 'conversation'
      ? 'Nothing on the Settings page names a model for this run, so the office runtime controls decide.'
      : 'The Casting table names no model this run can use, so the office runtime controls decide.'
  const nothingSetSaid = saying(place === 'conversation' ? 'modelNothingOnTheSettingsPage' : 'modelNothingOnTheCasting', {})
  if (place === 'check') {
    const model = inspectionSettings(env).model
    const source = readSetting('MOLE_OFFICE_INSPECTION_MODEL', env).source
    // NO SHIPPED MODEL, as FLO-05 of a decision says: with nothing set, the
    // answer names none and
    // says where one is named, and whoever starts the check refuses it.
    if (model === null) {
      const setting = 'MOLE_OFFICE_INSPECTION_MODEL'
      return {
        model: null,
        variant: null,
        says: `${nothingSet} ${setting} is not set, and the office has no default model. ${NO_MODEL_SAYS.check}`,
        said: [nothingSetSaid, saying('settingNobodySetAModel', { setting }), saying('modelNoneSoNoCheck', {})],
      }
    }
    return {
      model,
      variant: null,
      says: `${nothingSet} MOLE_OFFICE_INSPECTION_MODEL gives ${model}, from ${source}.`,
      said: [nothingSetSaid, saying('modelOfTheCheck', { model, source })],
    }
  }
  if (place === 'builder') {
    if (runtime !== null && runtime !== 'claude-code') {
      return {
        model: null,
        variant: null,
        says: `The Casting table names no model a ${runtimeShownName(runtime)} builder can use, and the office runtime controls name a model for Claude Code only.`,
        said: [saying('modelOnlyClaudeCodeBuilders', { runtime: runtimeShownName(runtime) })],
      }
    }
    const model = theModelIn(env)
    const said = [nothingSetSaid, whereTheModelCameFromSaid(env)]
    if (model === null) {
      return { model, variant: null, says: `${nothingSet} ${whereTheModelCameFrom(env)} ${NO_MODEL_SAYS.builder}`, said: [...said, saying('modelNoneSoNoBuilder', {})] }
    }
    return { model, variant: null, says: `${nothingSet} ${whereTheModelCameFrom(env)}`, said }
  }
  const choreModelSaid = [nothingSetSaid, whereTheChoreCameFromSaid('model', env)]
  if (runtime === 'opencode') {
    return {
      model: choreModelIn(env),
      variant: choreVariantIn(env),
      says: `${nothingSet} ${whereTheChoreModelCameFrom(env)}`,
      said: choreModelSaid,
    }
  }
  const model = theModelAChoreIsGiven(env)
  if (model === null) {
    return {
      model,
      variant: null,
      says: `${nothingSet} ${whereTheChoreModelCameFrom(env)} ${whereTheModelCameFrom(env)} ${NO_MODEL_SAYS.conversation}`,
      said: [...choreModelSaid, whereTheModelCameFromSaid(env), saying('modelNoneSoNoConversation', {})],
    }
  }
  return { model, variant: null, says: `${nothingSet} ${whereTheChoreModelCameFrom(env)}`, said: choreModelSaid }
}

export { whereTheModelCameFromSaid } from '@shared/where-a-run-model-came-from.ts'

export { whereTheChoreCameFromSaid } from '@shared/where-a-run-model-came-from.ts'

/**
 * What is asked: the place, and either an agent or a role card, the runtime if the caller knows it,
 * and the project whose Casting row applies (null for the every-project row).
 */
interface Asked {
  place: RunPlace
  agentId: string | null
  role: string | null
  runtime: string | null
  project: string | null
  model?: string | null
  /** The earlier Casting roll the caller read for the agent in the project, or null for none; left out, it is read here. */
  roll?: EarlierCastingRoll | null
}

/** What `answer` adds for the runtime page: the same sentences as codes. Null where one has none. */
export interface TheModelARunGetsSaid {
  runtimeSays: string
  runtimeSaid: DevSaying[]
  said: DevSaying[] | null
}

/**
 * THE HARNESS THAT CHOOSES THIS RUN'S MODEL AND EFFORT ITSELF, or null: the agent's record names a harness the office has
 * no adapter for, and the run goes to it. The model's part and the effort's part of an answer both ask this.
 */
function theHarnessThatChooses(own: ReturnType<typeof theModelOnTheAgentRecord>, runtime: string | null): string | null {
  return own !== null && own.harness !== null && runtime === own.harness ? own.harness : null
}

function modelAnswer(
  asked: Asked,
  own: ReturnType<typeof theModelOnTheAgentRecord>,
  store: RunModelSettings | undefined,
  env: NodeJS.ProcessEnv,
): TheModelARunGets & TheModelARunGetsSaid {
  // THE ROLE WHOSE CASTING ROW APPLIES: a builder's card, the inspector's for a check, none for a conversation.
  const card: string | null =
    asked.place === 'check'
      ? THE_INSPECTOR
      : asked.place === 'builder'
        ? (asked.role ?? (asked.agentId !== null ? theCardOf(asked.agentId) : null))
        : null
  const cast = card === null ? null : theCastingInForce(card, asked.project)
  const castProgram = cast?.cells.program.value ?? null
  const castModel = cast?.cells.model.value ?? null
  const castEffort = cast?.cells.effort.value ?? null
  const pair: RunModelPair | undefined = asked.place === 'conversation' ? store?.places.conversation : undefined
  const where = theSlotInWords({ in: 'places', name: 'conversation' })
  const whereSaid = 'conversation'

  // ---- the runtime
  let runtime: string | null
  let runtimeSays: string
  let runtimeSaid: DevSaying
  if (asked.place === 'check') {
    runtime = castProgram ?? THE_CHECKS_RUNTIME
    runtimeSaid = castProgram === null
      ? saying('runtimeOfACheck', { runtime })
      : saying('runtimeOnTheCasting', { role: THE_INSPECTOR })
    runtimeSays = inEnglish(runtimeSaid)
  } else if (asked.runtime !== null) {
    runtime = asked.runtime
    runtimeSays = `This run was asked for on ${runtime}.`
    runtimeSaid = saying('runtimeAskedFor', { runtime })
  } else if (own !== null && own.harness !== null) {
    // A HARNESS THE OFFICE HAS NO ADAPTER FOR IS THE RUN'S, and no other runtime is put in its place.
    runtime = own.harness
    runtimeSays = "The agent's own record names it."
    runtimeSaid = saying('runtimeOnTheAgentRecord', {})
  } else if (asked.place === 'builder' && own !== null && own.runtime !== null) {
    runtime = own.runtime
    runtimeSays = "The agent's own record names it."
    runtimeSaid = saying('runtimeOnTheAgentRecord', {})
  } else if (asked.place === 'builder' && card !== null && castProgram !== null) {
    runtime = castProgram
    runtimeSays = `The Casting table names it for ${card}.`
    runtimeSaid = saying('runtimeOnTheCasting', { role: card })
  } else if (pair?.runtime !== undefined) {
    runtime = pair.runtime
    runtimeSays = `The Settings page names it for ${where}.`
    runtimeSaid = saying('runtimeOnTheSettingsPage', { where: whereSaid })
  } else if (asked.place === 'conversation') {
    runtime = choreRuntimeIn(env)
    runtimeSays = whereTheChoreRuntimeCameFrom(env)
    runtimeSaid = whereTheChoreCameFromSaid('runtime', env)
  } else {
    runtime = null
    runtimeSays = 'Whoever starts a builder names its runtime, so nothing here can name one.'
    runtimeSaid = saying('runtimeNobodyNamesABuilders', {})
  }
  const said = { runtimeSays, runtimeSaid: [runtimeSaid] }

  // ---- a harness the office has no adapter for chooses its model itself
  const chooses = theHarnessThatChooses(own, runtime)
  if (chooses !== null) {
    const chosenThere = saying('modelChosenInTheHarness', { runtime: chooses })
    return { runtime: chooses, model: null, variant: null, from: 'none', says: inEnglish(chosenThere), ...said, said: [chosenThere] }
  }

  // ---- a runtime the message worker passes no model to
  if (asked.place === 'conversation' && runtime !== null && !isIn(THE_WORKER_GIVES.aModelTo, runtime)) {
    return {
      runtime,
      model: null,
      variant: null,
      from: 'none',
      says: `The office passes ${runtimeShownName(runtime)} no model when it answers a message, so ${runtimeShownName(runtime)} uses its own configuration.`,
      ...said,
      said: [saying('modelNotPassed', { runtime: runtimeShownName(runtime) })],
    }
  }
  const takesAVariant = asked.place === 'conversation' && isIn(THE_WORKER_GIVES.aVariantTo, runtime)
  const passedOver: string[] = []
  // THE SAME SENTENCES AS CODES. A sentence that names "no runtime" has no code, and the whole
  // answer then has none: the page draws the English as it came rather than half of it translated.
  const passedOverSaid: (DevSaying | null)[] = []
  const theseSaid = (last: DevSaying): DevSaying[] | null =>
    passedOverSaid.every((one) => one !== null) ? [...(passedOverSaid as DevSaying[]), last] : null

  // ---- a. the agent's own model
  if (own !== null && own.model !== null) {
    if (own.modelIsFor === runtime) {
      return {
        runtime,
        model: own.model,
        variant: takesAVariant ? own.variant : null,
        from: 'the agent',
        says: `${own.model} is this agent's own model, set on its profile.`,
        ...said,
        said: [
          saying('modelTheAgentsOwn', { model: own.model }),
        ],
      }
    }
    passedOver.push(
      `This agent's own model, ${own.model}, is for ${own.modelIsFor ?? 'no runtime'}, and this run is on ` +
        `${runtime ?? 'no runtime yet'}, so it is not used.`,
    )
    passedOverSaid.push(
      own.modelIsFor === null || runtime === null
        ? null
        : saying('modelTheAgentsOwnIsForAnother', { model: own.model, its: own.modelIsFor, this: runtime }),
    )
  }

  // ---- b. the role's Casting row (a builder, a check)
  if (card !== null) {
    if (castModel === null) {
      passedOver.push(`The Casting table names no model for ${card}.`)
      passedOverSaid.push(saying('modelTheCastingNamesNone', { role: card }))
    } else if (castProgram === null) {
      passedOver.push(`The Casting table names ${castModel} for ${card} and no program, so nothing says which program it is for, and it is not used.`)
      passedOverSaid.push(saying('modelOnTheCastingNoProgram', { model: castModel, role: card }))
    } else if (castProgram !== runtime) {
      passedOver.push(
        `The Casting table names ${castModel} for ${card} on ${castProgram}, and this run is on ${runtime ?? 'no runtime yet'}, so it is not used.`,
      )
      passedOverSaid.push(runtime === null ? null : saying('modelOnTheCastingForAnother', { model: castModel, role: card, its: castProgram, this: runtime }))
    } else {
      // A check is given the row's effort with its model (wave 13v round 27).
      const passesTheEffort = asked.place === 'check'
      return {
        runtime,
        model: castModel,
        variant: passesTheEffort ? castEffort : null,
        from: 'the role',
        // WHICH CASTING, so a tool can print its id and the decision behind its model (wave 13p's ask of the tools).
        casting: { id: cast!.id, scope: cast!.scope, decision: cast!.cells.model.from?.decision?.id ?? null },
        says: [...passedOver, `The Casting table names ${castModel} for ${card}.`].join(' '),
        ...said,
        said: theseSaid(
          saying('modelOnTheCasting', { model: castModel, role: card }),
        ),
      }
    }
  }

  // ---- b. the place (a conversation)
  if (pair !== undefined) {
    const pairRuntime = pair.runtime ?? null
    if (pairRuntime === runtime) {
      return {
        runtime,
        model: pair.model,
        variant: takesAVariant ? (pair.variant ?? null) : null,
        from: 'the place',
        says: [...passedOver, `The Settings page names ${pair.model} for ${where}.`].join(' '),
        ...said,
        said: theseSaid(saying('modelOnTheSettingsPage', { model: pair.model, where: whereSaid })),
      }
    }
    passedOver.push(
      `The Settings page names ${pair.model} for ${where} on ${pairRuntime ?? 'no runtime'}, and this run is on ` +
        `${runtime ?? 'no runtime yet'}, so it is not used.`,
    )
    passedOverSaid.push(
      pairRuntime === null || runtime === null
        ? null
        : saying('modelOnTheSettingsPageForAnother', { model: pair.model, where: whereSaid, its: pairRuntime, this: runtime }),
    )
  }

  // ---- c. a Codex run answering a message: its agent's Casting row in force, in place of .env
  if (asked.place === 'conversation' && runtime === 'codex') {
    // The Runtime page and the Settings page ask with no agent, so no row can be read, and no run starts from this answer.
    if (asked.agentId === null) {
      const none = saying('modelCodexTakesTheAgentsRow', {})
      return { runtime, model: null, variant: null, from: 'none', says: [...passedOver, inEnglish(none)].join(' '), ...said, said: theseSaid(none) }
    }
    const agent = agentsWithTheseIds([asked.agentId]).get(asked.agentId)?.handle ?? asked.agentId
    const role = theCardAnAnswerReads(asked)
    const row = role === null ? null : theCastingInForce(role, asked.project)
    const lacks = role === null ? null : whatACodexRowLacks(row, role)
    if (role !== null && row !== null && lacks === null) {
      const model = row.cells.model.value!
      const taken = saying('modelOnTheCasting', { model, role })
      return {
        runtime,
        model,
        variant: null,
        from: 'the role',
        casting: { id: row.id, scope: row.scope, decision: row.cells.model.from?.decision?.id ?? null },
        says: [...passedOver, inEnglish(taken)].join(' '),
        ...said,
        said: theseSaid(taken),
      }
    }
    const why = role === null
      ? [saying('modelCodexNoCard', { agent })]
      : [saying('modelCodexNeedsItsRow', { agent, role }), lacks!, saying('modelCodexFillInTheRow', { role })]
    const refused = allInEnglish(why)
    return {
      runtime,
      model: null,
      variant: null,
      from: 'none',
      refused,
      says: [...passedOver, refused].join(' '),
      ...said,
      said: passedOverSaid.every((one) => one !== null) ? [...(passedOverSaid as DevSaying[]), ...why] : null,
    }
  }

  // ---- c. .env
  const file = fromTheSettingsFile(asked.place, runtime, env)
  return {
    runtime,
    model: file.model,
    variant: takesAVariant ? file.variant : null,
    from: file.model === null ? 'none' : 'the settings file',
    says: [...passedOver, file.says].join(' '),
    ...said,
    said: passedOverSaid.every((one) => one !== null) ? [...(passedOverSaid as DevSaying[]), ...file.said] : null,
  }
}

/**
 * Effort is an independent choice for the answered model, with the office's explicit choices first. A rolled row removed
 * from the table refuses the answer with the table's 404, unless `aRemovedRolledRow` says the answer keeps it: then a
 * message run's answer keeps that sentence as its row.
 */
function answer(
  asked: Asked,
  store: RunModelSettings | undefined,
  env: NodeJS.ProcessEnv,
  aRemovedRolledRow: 'is refused' | 'is kept' = 'is refused',
): TheModelARunGets & TheModelARunGetsSaid {
  // THE AGENT'S RECORDS, read once for the whole answer (round 47): the model's part and the effort's part read the same
  // records, and nothing is written between the two.
  const own = asked.agentId === null ? null : theModelOnTheAgentRecord(asked.agentId)
  const selected = modelAnswer(asked, own, store, env)
  const model = asked.model ?? selected.model
  // THE EFFORT FOLLOWS THE MODEL THE RUN IS GIVEN, and nothing else: a run with no model has no effort. No model name is
  // kept in code for a runtime that names none, so a Codex run answering a message never takes another model's effort.
  const forEffort = model
  const card = theCardAnAnswerReads(asked)
  const cast = card === null ? null : theCastingInForce(card, asked.project)
  // THE ROW THE AGENT'S ROLL CHOSE (round 46), read only where a roll is made: a builder or the door, in a project.
  const rolled = asked.place === 'check' || asked.agentId === null || asked.project === null ? null : (asked.roll !== undefined ? asked.roll : theEarlierCastingRoll(asked.project, asked.agentId))?.record.selected ?? null
  // A MESSAGE RUN'S ANSWER KEEPS ITS CASTING ROW: a run that answers a message, for an agent, in a project.
  const keeps = asked.place === 'conversation' && asked.agentId !== null && asked.project !== null
  // THE ROLLED ROW AS IT IS NOW, read once and only where it is needed. Only the table's 404 for a removed row is caught,
  // and only where a message run's answer keeps it.
  const rolledNow: { row?: CastingRow | null; gone?: string } = {}
  const theRolledRowNow = (id: number): CastingRow | null => {
    if (rolledNow.row !== undefined) return rolledNow.row
    try {
      rolledNow.row = aCastingById(id)
    } catch (error) {
      if (!keeps || aRemovedRolledRow !== 'is kept' || !(error instanceof PanelError) || error.status !== 404) throw error
      rolledNow.row = null
      rolledNow.gone = error.message
    }
    return rolledNow.row
  }
  // ONE NAME FOR A ROW'S MODEL (wave 13n round BF): a name is a row's when it is the row's Office model or its native
  // provider and native model, by the one rule in src/config/launcher-selection.mjs. A name that exactly one row in
  // force matches takes that row's selection and effort, even when another row is rolled or in force (round BI). A name
  // that the rows in force match with two different models is ambiguous: no row gives it a selection or an effort, and
  // a start is refused.
  const inForce = card === null ? [] : theRowsInForce(card, asked.project)
  const names = (row: { cells: CastingRow['cells']; native?: CastingRow['native'] } | null | undefined, name: string | null) =>
    row != null && aNameNamesTheSelection(name, { runtime: row.cells.program.value, model: row.cells.model.value, native: row.native ?? null })
  const matched = model === null ? [] : inForce.filter((row) => names(row, model)).sort((one, two) => one.id - two.id)
  const rowsMatched = matched.flatMap((row) => row.cells.model.value === null ? [] : [{ row: row.id, model: row.cells.model.value }])
  const ambiguousSaid = new Set(rowsMatched.map((one) => one.model)).size < 2
    ? null
    : saying('modelNameMatchesRowsOfDifferentModels', { name: model!, rows: rowsMatched.map((one) => `${String(one.row)} (${one.model})`).join(', ') })
  const ambiguous: TheModelARunGets['ambiguous'] = ambiguousSaid === null ? undefined : { name: model!, rows: rowsMatched, says: inEnglish(ambiguousSaid) }
  // THE ONE ROW IN FORCE THE NAME MATCHES, when exactly one does (round BI).
  const theOneNamed = matched.length === 1 ? matched[0]! : null
  // THE AGENT'S OWN MODEL IS THE RUN'S (wave 13n round BK) when the two names are equal, when one is the other with the
  // provider the launcher adds in front (theProviderTheLauncherAdds), or when one row in force on the run's program
  // names both by the one rule. The compiled list is not read for it.
  const ownProvider = own?.modelIsFor != null ? theProviderTheLauncherAdds(own.modelIsFor) : null
  const isTheRunsModel = (name: string | null) => name !== null && forEffort !== null && (name === forEffort ||
    (ownProvider !== null && (`${ownProvider}/${name}` === forEffort || `${ownProvider}/${forEffort}` === name)) ||
    (ambiguous === undefined && inForce.some((row) => row.cells.program.value === selected.runtime && names(row, name) && names(row, forEffort))))
  // A NAME ALSO NAMES A ROLLED ROW OR THE ROW IN FORCE WITH NO NATIVE DATA when it is the name the office gives the
  // launcher for the row's program and Office model (theModelTheLauncherIsGiven): a Codex row's Office model with the
  // Codex provider in front. A rolled Codex row reaches the launcher by that name, and the one rule names a row with no
  // native data by its Office model alone. A row with native data is named by the one rule alone (wave 13n round BK).
  // It reads no compiled list.
  const theLauncherIsGiven = (row: { cells: CastingRow['cells']; native?: CastingRow['native'] } | null | undefined, name: string | null) =>
    row != null && row.native == null && row.cells.program.value !== null && row.cells.model.value !== null && name !== null &&
    theModelTheLauncherIsGiven({ runtime: row.cells.program.value, model: row.cells.model.value }) === name
  const rolledId = rolled?.rowId ?? null
  const rolledRow = rolledId === null ? null : inForce.find((row) => row.id === rolledId) ?? null
  let effort: string | null = null
  let effortFrom: NonNullable<TheModelARunGets['effortFrom']> = 'none'
  // The row the effort comes from, or the id of the rolled row it comes from, which is read only if it is needed.
  let effortsRow: Pick<CastingRow, 'id' | 'cells' | 'native' | 'selectionRevision'> | { rolled: number } | null = null
  const effortSaid: DevSaying[] = []
  const theRunIsRefused = asked.model == null && selected.refused !== undefined
  // A HARNESS THE OFFICE HAS NO ADAPTER FOR CHOOSES ITS EFFORT TOO, where the caller names no model. The office gives it
  // none, the owner's rule is not read for it, and the answer says no effort sentence: the model's part already says the
  // office gives that harness nothing, and a sentence about the owner's effort would not hold for it.
  const theHarnessChooses = asked.model == null && theHarnessThatChooses(own, selected.runtime) !== null
  if (own?.variant != null && own.modelIsFor === selected.runtime && isTheRunsModel(own.model)) {
    effort = own.variant
    effortFrom = 'the agent'
    effortSaid.push(saying('effortFromAgent', { effort }))
  } else if (ambiguous === undefined && rolled?.effort != null && rolled.rowId !== cast?.id && rolled.program === selected.runtime && (rolled.model === forEffort || names(rolledRow, forEffort) || theLauncherIsGiven(rolledRow, forEffort))) {
    effort = rolled.effort
    effortFrom = 'Casting roll'
    effortsRow = rolled.rowId === null ? null : { rolled: rolled.rowId }
    effortSaid.push(saying('effortFromCastingRoll', { effort, row: String(rolled.rowId) }))
  } else if (ambiguous === undefined && cast?.cells.effort.value != null && cast.cells.program.value === selected.runtime && (names(cast, forEffort) || theLauncherIsGiven(cast, forEffort))) {
    effort = cast.cells.effort.value
    effortFrom = 'Casting'
    effortsRow = cast
    effortSaid.push(saying('effortFromCasting', { effort, role: card! }))
  } else if (ambiguous === undefined && theOneNamed !== null && theOneNamed.cells.program.value === selected.runtime && theOneNamed.cells.effort.value != null) {
    effort = theOneNamed.cells.effort.value
    effortFrom = 'Casting'
    effortsRow = theOneNamed
    effortSaid.push(saying('effortFromTheNamedRow', { effort, row: String(theOneNamed.id), name: model! }))
  } else if (!theHarnessChooses) {
    effort = theOwnersEffort(forEffort)
    effortFrom = effort === null ? 'none' : "the owner's rule"
    if (ambiguous === undefined && cast?.cells.model.value != null && forEffort !== null && !names(cast, forEffort) && !theLauncherIsGiven(cast, forEffort)) {
      effortSaid.push(saying('effortCastingModelDiffers', { model: cast.cells.model.value, asked: forEffort }))
    }
    effortSaid.push(effort !== null ? saying('effortFromRule', { effort }) : theRunIsRefused ? saying('effortTheRunIsRefused', {}) : forEffort === null ? saying('effortNoModel', {}) : saying('effortNoneForModel', { model: forEffort }))
  }
  // New launcher rows are complete tuples. Native fields are never borrowed from a sibling row. Every place is given its
  // row's selection under one rule: the rolled row if it names this program and model, else the one row in force the name
  // matches, else the row in force, `cast`. A check reads no roll, so its row is the inspector's row in force. A
  // conversation's model still comes from its own layers; the row's selection is given only when that model is the row's.
  let selection: ReturnType<typeof selectionOfACasting> = null
  let namedCasting: TheModelARunGets['casting']
  let held: TheModelARunGets['held']
  // The row the selection comes from, or would come from were it not held.
  let selectionsRow: Pick<CastingRow, 'id' | 'cells' | 'native' | 'selectionRevision'> | null = null
  // The row the selection would have come from, whether or not it had one to give.
  let theSelectionRow: Pick<CastingRow, 'id' | 'cells' | 'native'> | null = null
  if (model !== null && ambiguous === undefined) {
    const row = rolled?.rowId != null && rolled.program === selected.runtime && (rolled.model === model || names(rolledRow, model)) ? theRolledRowNow(rolled.rowId) : theOneNamed ?? cast
    theSelectionRow = row
    if (row?.native != null && row.cells.program.value === selected.runtime && names(row, model)) {
      selectionsRow = row
      // A HELD ROW STOPS A START AND NEVER A READ. The answer then has no selection and names the hold in the sentence
      // lib/casting.ts makes for it; theModelARunStartsWith refuses it. Only that refusal is caught here.
      try {
        selection = selectionOfACasting(row)
        if (theOneNamed !== null && row.id === theOneNamed.id) {
          // THE CASTING THE ANSWER NAMES IS THE ROW THE SELECTION CAME FROM, even when the caller named the model and the
          // row in force is another one.
          namedCasting = { id: theOneNamed.id, scope: theOneNamed.project === null ? 'every project' : 'the project', decision: theOneNamed.cells.model.from?.decision?.id ?? null }
        }
      } catch (error) {
        if (row.hold == null || !(error instanceof PanelError) || error.status !== 409) throw error
        held = { row: row.id, says: error.message }
      }
      // THE AGENT'S OWN EFFORT GOES INTO THE ROW'S SELECTION (wave 13n round BK), because the launcher applies only the
      // selection. An OpenCode row's variant is replaced as well, since OpenCode carries one variant option. When the row
      // sets an effort of its own, the sentence names both; a row that sets none keeps the sentence for the agent's effort.
      const rowsEffort = selection === null ? null : selection.native.variant ?? selection.native.effort
      if (selection !== null && effortFrom === 'the agent' && effort !== null && effort !== rowsEffort) {
        selection = { ...selection, native: { ...selection.native, variant: selection.native.variant === null ? null : effort, effort } }
        // The agent's branch above says one sentence, the one for the agent's own effort; this one takes its place.
        if (rowsEffort !== null) effortSaid.splice(0, effortSaid.length, saying('effortFromAgentInPlaceOfTheRow', { effort, row: String(row.id), rowEffort: rowsEffort }))
      }
    }
  }
  // THE ROW A MESSAGE RUN'S QUEUE KEEPS, and its start reads again: the row the selection comes from or would come from,
  // else the row the effort comes from, else none. A rolled row removed from the table is kept as the table's words.
  let kept: TheRowAMessageRunKeeps | undefined
  if (keeps) {
    const row = selectionsRow ?? (effortsRow !== null && 'rolled' in effortsRow ? theRolledRowNow(effortsRow.rolled) : effortsRow)
    const id = row === null ? '' : String(row.id)
    kept = rolledNow.gone !== undefined ? { row: null, says: rolledNow.gone }
      : row === null ? { row: null, says: 'No Casting row gives this run its selection or its effort.' }
      : {
          row: theRowAsTheAskReadIt(row),
          says: selectionsRow === null ? `Casting row ${id} gives this run its effort.`
            : held === undefined ? `Casting row ${id} gives this run its selection.`
            : `Casting row ${id} would give this run its selection, and it is held.`,
        }
  }
  // WHY THERE IS NO SELECTION, where no hold, ambiguity or refusal already says why. The row it names is the one the
  // selection would have come from; with no model at all it is the row in force, if any. A harness the office has no
  // adapter for is left out too: the model's part already says the harness chooses its model itself, and the reason
  // for a runtime that takes no model would say the office answers its messages, which it does not.
  const noSelection =
    selection === null && held === undefined && ambiguous === undefined && selected.refused === undefined && !theHarnessChooses
      ? whyThereIsNoSelection(model, selected.runtime, card, cast, theSelectionRow, asked.place)
      : undefined
  const modelSaid = asked.model == null ? selected.said : [saying('modelNamedByCaller', { model: model! })]
  // A MODEL THE CALLER NAMES IS THE MODEL, so a Codex refusal applies only where the caller names none.
  const { refused, ...answered } = selected
  return { ...answered, ...(refused === undefined || asked.model != null ? {} : {refused}), ...(selection === null ? {} : {selection}), ...(held === undefined ? {} : {held}), ...(ambiguous === undefined ? {} : {ambiguous}), ...(noSelection === undefined ? {} : {noSelection}), ...(namedCasting === undefined ? {} : { casting: namedCasting }), ...(kept === undefined ? {} : { kept }), model, variant: asked.place === 'check' ? effort : selected.variant, from: asked.model == null ? selected.from : 'the caller', effort, effortFrom,
    says: `${asked.model == null ? selected.says : inEnglish(saying('modelNamedByCaller', { model: model! }))}${effortSaid.length === 0 ? '' : ` ${allInEnglish(effortSaid)}`}${held === undefined ? '' : ` ${held.says}`}${ambiguous === undefined ? '' : ` ${ambiguous.says}`}`,
    // The hold's sentence has no code, so a held answer has none, and a page draws `says` as it came.
    said: modelSaid === null || held !== undefined ? null : [...modelSaid, ...effortSaid, ...(ambiguousSaid === null ? [] : [ambiguousSaid])] }
}

/**
 * THE MODEL A RUN GETS, AND WHERE THAT ANSWER CAME FROM.
 *
 * `agentId` is a registry id, never a handle: a caller holding an arriving reference resolves it
 * first. `runtime` is the runtime the caller already knows the run goes to, or null for this reader
 * to work out. For a check it is not asked: a check always runs on claude-code.
 *
 * `env` is the environment layer c reads. It is .env under this process's own environment unless a
 * caller hands in the one world it is answering about, as `whereRunsGo` and `theQueue` do.
 *
 * `roll` is the agent's earlier Casting roll in `project` as the caller read it with `theEarlierCastingRolls`, or null
 * where it read none. The answer then reads no roll of its own. The message queue reads every agent's roll once per pass
 * and hands each its own. Left out, the roll is read here, where an answer reads one.
 */
export function theModelARunGets(
  asked: { place: RunPlace; agentId: string | null; runtime: string | null; project?: string | null; model?: string | null; roll?: EarlierCastingRoll | null },
  env: NodeJS.ProcessEnv = mergedEnvironment(),
): TheModelARunGets & { runtimeSays: string; provider?: TheProviderACheckTakes } {
  return theAnswerFor(asked, env, 'is kept')
}

/**
 * The answer `theModelARunGets` and `theModelARunStartsWith` both give, without its codes. A selection whose row names
 * a provider-table row adds `provider`: the row's fields a check uses and whether its key is set, never the key.
 */
function theAnswerFor(
  asked: Parameters<typeof theModelARunGets>[0],
  env: NodeJS.ProcessEnv,
  aRemovedRolledRow: 'is refused' | 'is kept',
): ReturnType<typeof theModelARunGets> {
  const { said: _said, runtimeSaid: _runtimeSaid, ...answered } = answer(
    { place: asked.place, agentId: asked.agentId, runtime: asked.runtime, role: null, project: asked.project ?? null, model: asked.model, ...(asked.roll === undefined ? {} : { roll: asked.roll }) },
    theStore().settings,
    env,
    aRemovedRolledRow,
  )
  const named = answered.selection?.native.providerRow
  if (named === undefined || answered.selection?.casting == null) return answered
  return { ...answered, provider: theProviderACheckTakes(answered.selection.casting.id, named) }
}

/**
 * A DSH OR CODEX CHECK WHOSE ROW NAMES A PROVIDER STARTS ONLY ON THAT PROVIDER'S KEY, so each reason it could not is
 * refused here with a 409, in that program's codes, and nothing falls back to the template's key or a login: the
 * provider is gone, it is not for the program any more, the router is on, or the key file's entry it names is not set.
 * For dsh the router leaves routed keys out of an exec; Codex's key is not a routed one, so this refusal is the only
 * thing that keeps a Codex check from a provider's key while the router is on. Another program is refused by its
 * launcher (applyLauncherSelection in src/config/launcher-selection.mjs).
 */
function refuseAProviderTheCheckCannotTake(answered: ReturnType<typeof theModelARunGets>, env: NodeJS.ProcessEnv): void {
  const provider = answered.provider
  if (provider === undefined || (answered.runtime !== 'dsh' && answered.runtime !== 'codex')) return
  const program = answered.runtime
  const codes = program === 'dsh'
    ? { gone: 'dshProviderGone', notFor: 'dshProviderNotForDsh', router: 'dshProviderWhileTheRouterIsOn', keyNotSet: 'dshProviderKeyNotSet' } as const
    : { gone: 'codexProviderGone', notFor: 'codexProviderNotForCodex', router: 'codexProviderWhileTheRouterIsOn', keyNotSet: 'codexProviderKeyNotSet' } as const
  const row = String(provider.row)
  if (!provider.found) throw aProviderRefusal(codes.gone, { row, provider: provider.id }, 409)
  if (!(provider.programs as readonly string[]).includes(program)) throw aProviderRefusal(codes.notFor, { row, provider: provider.id, programs: provider.programs.join(', ') }, 409)
  if (theProviderRouterIsOn(env)) throw aProviderRefusal(codes.router, { row, provider: provider.id }, 409)
  if (provider.key !== 'set') throw aProviderRefusal(codes.keyNotSet, { row, provider: provider.id, entry: provider.keyName }, 409)
}

/**
 * THE SAME ANSWER FOR A RUN ABOUT TO START. A Casting row held after a native refusal is refused here with a 409 and
 * the hold's own sentence from lib/casting.ts, and so is a Codex run answering a message that nothing names a model for
 * and whose Casting row cannot give one, with the sentence in `refused`. Every door that starts a run asks this; a read
 * asks `theModelARunGets`, which answers and names the hold or the refusal. A rolled row removed from the table is
 * refused with the table's 404.
 *
 * `kept` is the Casting row a message run's queue read, or null because it read none; it is left out by a start that
 * was given none. The row is read again by its id first, and a row held, removed or changed since is refused with a
 * 409. A start whose answer reads another row than the queue kept, or a row where the queue kept none, is refused with
 * a 409 too. No other row is taken and nothing is rolled again.
 */
export function theModelARunStartsWith(
  asked: Parameters<typeof theModelARunGets>[0] & { kept?: TheRowAWorkerIsGiven | null },
  env: NodeJS.ProcessEnv = mergedEnvironment(),
): ReturnType<typeof theModelARunGets> {
  const { kept, ...askedOf } = asked
  if (kept != null) {
    const again = theKeptRowAtTheStart(kept, 'the queue')
    if (!again.ok) throw new PanelError(again.says, 409)
  }
  const answered = theAnswerFor(askedOf, env, 'is refused')
  if (answered.held !== undefined) throw new PanelError(answered.held.says, 409)
  if (answered.ambiguous !== undefined) throw new PanelError(answered.ambiguous.says, 409)
  if (answered.refused !== undefined) throw new PanelError(answered.refused, 409)
  refuseAProviderTheCheckCannotTake(answered, env)
  if (kept !== undefined) {
    const moved = theRowAStartLeaves(kept, answered.kept)
    if (moved !== null) throw new PanelError(moved, 409)
  }
  return answered
}

/**
 * THE SAME ANSWER WITH ITS SENTENCES AS CODES, for the runtime page (src/server/lib/runtime.ts). A
 * builder is asked by its role card, the way the Casting table keeps a row for each, and the
 * every-project row answers.
 */
export function theModelARunGetsWithCodes(
  asked: { place: RunPlace; role: string | null },
  env: NodeJS.ProcessEnv = mergedEnvironment(),
): TheModelARunGets & TheModelARunGetsSaid {
  return answer({ ...asked, agentId: null, runtime: null, project: null }, theStore().settings, env)
}

export { theOfficeChoseIt } from '@shared/where-a-run-model-came-from.ts'

/** WHAT `GET /api/office/run-models` ANSWERS: the place this store keeps, what is set, and what is in force. */
export function everyRunModel(env: NodeJS.ProcessEnv = mergedEnvironment()): RunModelsReading {
  const stored = theStore()
  const places: RunModelSlotReading[] = RUN_MODEL_PLACES.map((name) => ({
    slot: { in: 'places', name },
    set: stored.settings?.places[name] ?? null,
    inForce: withoutRuntimeSays(answer({ place: name, agentId: null, role: null, runtime: null, project: null }, stored.settings, env)),
  }))
  return {
    places,
    updatedAt: stored.updatedAt,
    updatedBy: stored.updatedBy,
    runtimes: AGENT_RUNTIMES,
    theWorkerGives: THE_WORKER_GIVES,
    notices: NOTICES_START_NO_RUN,
  }
}

function withoutRuntimeSays(answered: TheModelARunGets & TheModelARunGetsSaid): TheModelARunGets {
  // `said` STAYS (wave 13k round 35): an agent's profile draws it in the page's language, where it drew the
  // English `says` on a Chinese page. Only the runtime's two lines, which the profile does not draw, go.
  const { runtimeSays: _unused, runtimeSaid: _runtimeSaid, ...rest } = answered
  return rest
}

/** One agent's own model, and what its runs get now. `agentId` is a registry id. */
export function anAgentsRunModel(agentId: string, env: NodeJS.ProcessEnv = mergedEnvironment()): AnAgentsRunModel {
  const own = theModelOnTheAgentRecord(agentId)
  const store = theStore().settings
  return {
    agentId,
    runtime: own?.harness ?? own?.runtime ?? null,
    model: own?.model ?? null,
    variant: own?.variant ?? null,
    builder: withoutRuntimeSays(answer({ place: 'builder', agentId, role: null, runtime: null, project: null }, store, env)),
    conversation: withoutRuntimeSays(answer({ place: 'conversation', agentId, role: null, runtime: own?.runtime ?? null, project: null }, store, env)),
    theWorkerGives: THE_WORKER_GIVES,
  }
}

// ============================================================================ the writers

/** A change to the office's choices: each slot named is set to a pair, or cleared with null. */
export interface RunModelsChange {
  places?: Partial<Record<(typeof RUN_MODEL_PLACES)[number], RunModelPair | null>>
}

/** A person may write what they mean: spaces around a word are taken off, and an empty variant means none. */
function tidied(pair: RunModelPair): RunModelPair {
  const variant = pair.variant?.trim() ?? ''
  return {
    ...(pair.runtime === undefined ? {} : { runtime: pair.runtime }),
    model: pair.model.trim(),
    ...(variant === '' ? {} : { variant }),
  }
}

function authorityOf(actor: Actor): string | null {
  if (actor.theOwnersAuthority?.holds === true) return actor.theOwnersAuthority.because
  // OR THEIR RAISE, named by its grant: the row then says what allowed the write, as every
  // other write under a raise does on its ledger row.
  if (actor.elevationUsed === true && actor.elevation !== undefined) return underTheRaise(actor.elevation.id)
  return null
}

/**
 * SET OR CLEAR THE OFFICE'S CHOICES. Only the slots the change names are touched.
 *
 * EVERY SLOT IS CHECKED BEFORE ANYTHING IS WRITTEN. The whole next object goes through the same
 * strict reader the store is read with, so what is written is exactly what can be read back, and a
 * refusal leaves the row as it was.
 */
export function setTheRunModels(change: RunModelsChange, actor: Actor): RunModelsReading {
  const now = theStore().settings ?? { places: {} }
  const next: RunModelSettings = { places: { ...now.places } }
  for (const [name, pair] of Object.entries(change.places ?? {})) {
    const key = name as keyof RunModelSettings['places']
    if (pair === null) delete next.places[key]
    else if (pair !== undefined) {
      const refused = whyThisPairIsRefused({ in: 'places', name: key }, tidied(pair), THE_WORKER_GIVES)
      if (refused !== null) throw new PanelError(`${refused} Nothing was written.`, 400)
      next.places[key] = tidied(pair)
    }
  }
  // THE SAME STRICT READER THE STORE IS READ WITH, so nothing is written that could not be read back.
  readRunModels(next, THE_WORKER_GIVES)
  const at = nowStamp()
  sqlite
    .prepare(
      'INSERT INTO run_models (only_row, settings, updated_at, updated_by_kind, updated_by_id, authority) ' +
        'VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(only_row) DO UPDATE SET settings=excluded.settings, ' +
        'updated_at=excluded.updated_at, updated_by_kind=excluded.updated_by_kind, updated_by_id=excluded.updated_by_id, ' +
        'authority=excluded.authority',
    )
    .run(JSON.stringify(next), at, actor.type, actor.id, authorityOf(actor))
  return everyRunModel()
}
