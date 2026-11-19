// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { CastingSelection } from './casting.ts'
/**
 * THE MODEL A RUN USES, AS THE SETTINGS PAGE STORES IT. Criterion U2.
 *
 * -----------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * -----------------------------------------------------------------------------------------
 *
 * The shape of what the office stores, and one strict reader of it. `readPriceTable` in
 * `price-table.ts` is the pattern: `undefined` means nobody has set anything, and anything that
 * is not this shape is refused loudly rather than read as empty. The store, the doors and the
 * panel all read the shape from here, so it is worked out in one place (the ninth invariant).
 *
 * -----------------------------------------------------------------------------------------
 * THE ONE SLOT, AND WHERE THE OTHERS WENT
 * -----------------------------------------------------------------------------------------
 *
 *   places.conversation   a run the office starts to answer a message
 *
 * A builder's model for each role card, and the inspector's check, are kept in the Casting table
 * (src/shared/casting.ts), because a role's program, model and effort are
 * one fact kept in one place. Migration 0189 copied what this store held for them there, and
 * rewrote nothing here, because a migration only adds. So a row written before 0189 may still
 * hold `builders` and `places.check`: the reader knows both words, reads neither, and leaves them
 * out of what it answers, and the next write leaves them out of the row.
 *
 * A NOTICE HAS NO SLOT. A notice starts no run: it is a line `tellThemOncePerCause` writes. So
 * there is nothing to choose a model for.
 *
 * -----------------------------------------------------------------------------------------
 * WHICH SLOT TAKES A RUNTIME AND A VARIANT
 * -----------------------------------------------------------------------------------------
 *
 * A model name means something only to the runtime it was written for. So the pair names its
 * runtime, and only a runtime the message worker passes a model to, because a model stored for a
 * runtime that is never given one would be a setting that does nothing while it says it does. The
 * same rule holds for a reasoning effort (the "variant") stored here: only a runtime the message
 * worker passes one to may hold one. Which runtimes those are is worked out from what each runtime
 * passes on, the table the adapters read (`theRuntimesTheWorkerGives` in
 * src/worker/runtimes/what-a-runtime-passes-on.ts). The server hands that answer to the functions here,
 * because this file is bundled for the browser and cannot load a file out of src/worker. A check
 * is given the effort the Casting table names for the inspector, with its model (wave 13v round 27);
 * that effort is the Casting table's, not a slot here.
 */
import { AGENT_RUNTIMES, isAgentRuntime, type AgentRuntime } from './participants.ts'
import { THE_SECRETARY, THE_SUPERVISOR, THE_WORKER } from './roles.ts'
import type { DevSaying } from './dev-sayings.ts'
import type { THE_EFFORT_SOURCES } from '../config/model-efforts.mjs'
import type { TheRowAWorkerIsGiven } from './worker-runs.ts'

/** The one place the office starts a run by itself and keeps a model for here. A notice starts none. */
export const RUN_MODEL_PLACES = ['conversation'] as const
export type RunModelPlace = (typeof RUN_MODEL_PLACES)[number]

/**
 * THE ROLE CARDS THE RUNTIME PAGE DRAWS A BUILDER ROW FOR: the cards of design/permissions/roles.json
 * that a secretary starts builders with. Their models are in the Casting table. The names come from
 * src/shared/roles.ts, the one file that names the cards, so they are not typed a second time here
 * (tests/one-declaration-decides-what-a-role-may-do).
 */
export const BUILDER_ROLES = [THE_SECRETARY, THE_SUPERVISOR, THE_WORKER] as const
export type BuilderRole = (typeof BUILDER_ROLES)[number]

/**
 * WHICH RUNTIMES THE MESSAGE WORKER PASSES A MODEL AND A REASONING EFFORT TO, from the table the
 * adapters read (`theRuntimesTheWorkerGives` in src/worker/runtimes/what-a-runtime-passes-on.ts). Both
 * run-models readings carry it, so a page offers the choices the doors take.
 */
export interface TheRuntimesTheWorkerGives {
  /** The runtimes whose adapter passes the model the office chose. */
  aModelTo: readonly AgentRuntime[]
  /** The runtimes whose adapter passes the reasoning effort the office chose. */
  aVariantTo: readonly AgentRuntime[]
}

/** The runtime a check runs on. tools/the-inspector.mjs starts `claude`, and nothing else. */
export const THE_CHECKS_RUNTIME = 'claude-code' as const satisfies AgentRuntime

/** One stored choice: the runtime it is for, the model, and a reasoning effort where one is passed. */
export interface RunModelPair {
  runtime?: AgentRuntime
  model: string
  variant?: string
}

/** Everything the Settings page stores. A slot nobody set is absent. */
export interface RunModelSettings {
  places: Partial<Record<RunModelPlace, RunModelPair>>
}

/** The slot a pair is stored in, for the sentences that name it. */
export type RunModelSlot = { in: 'places'; name: RunModelPlace }

/** What a slot is, in words a person reads. */
export function theSlotInWords(_slot: RunModelSlot): string {
  return 'a run the office starts to answer a message'
}

function isWord(list: readonly string[], value: string): boolean {
  return list.includes(value)
}

/**
 * WHY ONE PAIR CANNOT BE STORED IN ONE SLOT, or null because it can.
 *
 * The one place the rules above are applied, so the reader and the doors cannot disagree.
 */
export function whyThisPairIsRefused(slot: RunModelSlot, pair: unknown, gives: TheRuntimesTheWorkerGives): string | null {
  const where = theSlotInWords(slot)
  if (typeof pair !== 'object' || pair === null || Array.isArray(pair)) return `The choice for ${where} is not an object.`
  const bag = pair as Record<string, unknown>
  for (const key of Object.keys(bag)) {
    if (key !== 'runtime' && key !== 'model' && key !== 'variant') return `The choice for ${where} holds "${key}", which is not runtime, model or variant.`
  }
  const model = bag['model']
  if (typeof model !== 'string' || model.trim() === '') return `The choice for ${where} names no model.`
  if (model !== model.trim()) return `The model for ${where} has spaces around it.`
  const runtime = bag['runtime']
  const variant = bag['variant']
  if (variant !== undefined && (typeof variant !== 'string' || variant.trim() === '' || variant !== variant.trim())) {
    return `The reasoning effort for ${where} is empty or has spaces around it.`
  }
  if (runtime === undefined) return `The choice for ${where} names no runtime. A model name means something only to the runtime it was written for.`
  if (!isAgentRuntime(runtime)) return `"${String(runtime)}" is not a runtime this office knows. It knows ${AGENT_RUNTIMES.join(', ')}.`
  if (!isWord(gives.aModelTo, runtime)) {
    return `The office passes ${runtime} no model when it answers a message, so a model for it would never be used. It passes one to ${gives.aModelTo.length === 0 ? 'no runtime' : gives.aModelTo.join(' and ')}.`
  }
  if (variant !== undefined) {
    if (!isWord(gives.aVariantTo, runtime)) {
      return `The office passes ${runtime} no reasoning effort. It passes one to ${gives.aVariantTo.length === 0 ? 'no runtime' : `${gives.aVariantTo.join(' and ')} only`}.`
    }
  }
  return null
}

/**
 * WHY AN AGENT'S OWN MODEL CANNOT BE STORED, or null because it can.
 *
 * An agent's own model is for the runtime its record names, so an agent whose record names none
 * cannot be given one: nothing would say which runtime the name was written for.
 */
export function whyAnAgentsModelIsRefused(runtime: string | null, model: string, variant: string | null, gives: TheRuntimesTheWorkerGives): string | null {
  if (runtime === null) return "This agent's record names no runtime, so a model cannot be tied to one. Nothing was written."
  if (model.trim() === '') return 'Name a model. Nothing was written.'
  if (variant !== null) {
    if (variant.trim() === '') return 'A reasoning effort cannot be empty. Nothing was written.'
    if (!isWord(gives.aVariantTo, runtime)) {
      return `This agent runs on ${runtime}, and the office passes ${runtime} no reasoning effort. Nothing was written.`
    }
  }
  return null
}

function readSlots<K extends string>(
  bag: unknown,
  names: readonly K[],
  label: string,
  slot: (name: K) => RunModelSlot,
  gives: TheRuntimesTheWorkerGives,
): Partial<Record<K, RunModelPair>> {
  if (bag === undefined) return {}
  if (typeof bag !== 'object' || bag === null || Array.isArray(bag)) throw new Error(`The stored run models hold a ${label} that is not an object.`)
  const out: Partial<Record<K, RunModelPair>> = {}
  for (const [key, value] of Object.entries(bag as Record<string, unknown>)) {
    if (!(names as readonly string[]).includes(key)) throw new Error(`The stored run models hold ${label}.${key}, which is not one of ${names.join(', ')}.`)
    const name = key as K
    const refused = whyThisPairIsRefused(slot(name), value, gives)
    if (refused !== null) throw new Error(refused)
    const pair = value as RunModelPair
    out[name] = {
      ...(pair.runtime === undefined ? {} : { runtime: pair.runtime }),
      model: pair.model,
      ...(pair.variant === undefined ? {} : { variant: pair.variant }),
    }
  }
  return out
}

/**
 * READ A STORED VALUE, OR SAY NOBODY HAS SET ANYTHING.
 *
 * `undefined` and `null` answer `undefined`: nothing is set. Anything else that is not the shape
 * above throws, because a store holding something unreadable is a broken assumption and not an
 * empty setting.
 */
export function readRunModels(stored: unknown, gives: TheRuntimesTheWorkerGives): RunModelSettings | undefined {
  if (stored === undefined || stored === null) return undefined
  if (typeof stored !== 'object' || Array.isArray(stored)) throw new Error('The stored run models are not an object.')
  const bag = stored as Record<string, unknown>
  for (const key of Object.keys(bag)) {
    // A ROW WRITTEN BEFORE MIGRATION 0189 may hold `builders`; 0189 copied it into the Casting table.
    if (key !== 'places' && key !== 'builders') throw new Error(`The stored run models hold "${key}", which is not places.`)
  }
  const held = bag['places']
  let places = held
  if (typeof held === 'object' && held !== null && !Array.isArray(held) && 'check' in held) {
    // AND `places.check`, which 0189 copied into the Casting table's inspector row. Neither is read here.
    const { check: _movedToTheCastingTable, ...rest } = held as Record<string, unknown>
    places = rest
  }
  return { places: readSlots(places, RUN_MODEL_PLACES, 'places', (name) => ({ in: 'places', name }), gives) }
}

// ============================================================================ what the doors answer

/**
 * Which layer an answer came from. `the role` is the Casting table's row for the run's role card (a
 * builder's card, or the inspector's for a check). `none` means no layer names a model for this run.
 */
export type RunModelLayer = 'the agent' | 'the place' | 'the role' | 'the settings file' | 'the caller' | 'none'

/** The source of the effort selected by the office. */
export type EffortSource = (typeof THE_EFFORT_SOURCES)[number]

/**
 * WHY AN ANSWER GAVE NO SELECTION, as a word a tool can branch on. `no-model` is nothing names a model;
 * `runtime-takes-no-model` is a message run whose runtime reads its own configuration; `no-row` is a card
 * with no row in force; `no-role-card` is a run no card names; `row-names-no-model`, `row-names-no-program`
 * and `row-has-no-native` are what the row in force lacks; `row-for-another-program` is a row the run's
 * program cannot take; `model-not-the-rows` is a model the row does not name.
 */
export const NO_SELECTION_REASONS = [
  'no-model',
  'runtime-takes-no-model',
  'no-row',
  'no-role-card',
  'row-names-no-model',
  'row-names-no-program',
  'row-has-no-native',
  'row-for-another-program',
  'model-not-the-rows',
] as const
export type NoSelectionReason = (typeof NO_SELECTION_REASONS)[number]

/**
 * WHY A RUN GOT NO SELECTION: the reason, the Casting row it is about when one is, and one plain sentence.
 * Present only on an answer with no `selection` and none of `held`, `ambiguous` or `refused`, which say their
 * own reasons. A message run's answer keeps its own `kept` sentence.
 */
export interface TheNoSelection {
  reason: NoSelectionReason
  /** The Casting row the reason is about, or null because no row in force is. */
  castingRow: number | null
  /** One plain sentence saying why there is no selection. */
  says: string
}

/** What `theModelARunGets` answers. */
export interface TheModelARunGets {
  /** The runtime the run goes to, or null because nothing names one. */
  runtime: string | null
  /** The model the run is given, or null because it is given none. */
  model: string | null
  /** The reasoning effort the run is given, or null because it is given none. */
  variant: string | null
  /** The effort selected by the office. Optional for replies from an older office. */
  effort?: string | null
  selection?: CastingSelection
  /**
   * THE CASTING ROW THE SELECTION WOULD COME FROM, WHEN IT IS HELD after a native refusal: the row's id and the sentence
   * src/server/lib/casting.ts makes for the hold. Such an answer has no `selection`, `says` ends with the sentence, and
   * `said` is null. Every door that starts a run refuses it with a 409.
   */
  held?: { row: number; says: string }
  /**
   * THE CASTING ROWS IN FORCE THAT A NAMED MODEL MATCHES, WHEN THEY NAME DIFFERENT MODELS: the name, each row's id and
   * Office model, and the sentence that says so. A name matches a row when it is the row's Office model or its native
   * provider and native model. Such an answer has no selection and no row's effort, `says` ends with the sentence, and
   * every door that starts a run refuses it with a 409.
   */
  ambiguous?: { name: string; rows: { row: number; model: string }[]; says: string }
  /**
   * THE SENTENCE A START IS REFUSED WITH, when nothing names a model for a Codex run that answers a message and the
   * agent's Casting row in force cannot give one. It names the agent, what the row lacks and the Casting page. Such an
   * answer has no model, and every door that starts a run refuses it with a 409.
   */
  refused?: string
  effortFrom?: EffortSource
  /** Why this answer has no selection, when it has none and no hold, ambiguity or refusal says why. */
  noSelection?: TheNoSelection
  /** Which layer the model came from. */
  from: RunModelLayer
  /** One plain sentence a person reads: which model, and why this one. */
  says: string
  /**
   * THE SAME SENTENCE AS CODES WITH THEIR VALUES (src/shared/dev-sayings.ts), so an agent's profile draws it in its
   * own language (wave 13k round 35). Null where one part of it has no code; a page then draws `says` as it came.
   * Left out by the replies that never carried it.
   */
  said?: DevSaying[] | null
  /**
   * THE CASTING THE MODEL OR ITS SELECTION CAME FROM: the row's id, whose scope it is, and the decision its model cell
   * names, or null when it names none. A tool that starts a run prints it (wave 13p's round 2).
   */
  casting?: { id: number; scope: 'the project' | 'every project'; decision: string | null }
  /**
   * THE CASTING ROW A MESSAGE RUN'S QUEUE KEEPS: the row its selection or its effort comes from, in the project its
   * start reads, or none, with a sentence. Given only for a run that answers a message, with an agent and a project.
   */
  kept?: TheRowAMessageRunKeeps
}

/**
 * THE ROW A MESSAGE RUN IS STARTED ON, as the queue read it, or null because no Casting row gives the run its selection
 * or its effort, with the sentence that says which. The start reads the row again by its id and takes no other.
 */
export interface TheRowAMessageRunKeeps {
  row: TheRowAWorkerIsGiven | null
  says: string
}

/** One slot on the Settings page: what is set there, and what is in force now. */
export interface RunModelSlotReading {
  slot: RunModelSlot
  /** What the Settings page holds for this slot, or null because nobody set it. */
  set: RunModelPair | null
  /** What a run in this slot gets now, with no agent's own model in the way. */
  inForce: TheModelARunGets
}

/** What `GET /api/office/run-models` answers. */
export interface RunModelsReading {
  places: RunModelSlotReading[]
  /** When the store was last written and by whom, or null because nobody has written it. */
  updatedAt: string | null
  updatedBy: { kind: string; id: string } | null
  /** The runtime words a pair may name, from the one list the office declares. */
  runtimes: readonly string[]
  /** Which runtimes the message worker passes a model and a reasoning effort to, from the table the adapters read. */
  theWorkerGives: TheRuntimesTheWorkerGives
  /** One sentence about notices, which start no run and so have no setting. */
  notices: string
}

/** One agent's own model, as its profile shows it. */
export interface AnAgentsRunModel {
  agentId: string
  /** The runtime its record names, or null. */
  runtime: string | null
  /** The model its record names, or null because none is set. */
  model: string | null
  variant: string | null
  /** What a builder run of this agent gets now, and from which layer (its role's Casting row in every project). */
  builder: TheModelARunGets
  /** What a run answering a message for this agent gets now, and from which layer. */
  conversation: TheModelARunGets
  /** Which runtimes the message worker passes a model and a reasoning effort to, from the table the adapters read. */
  theWorkerGives: TheRuntimesTheWorkerGives
}

/** THE SENTENCE ABOUT NOTICES, written once. */
export const NOTICES_START_NO_RUN = 'A notice starts no run, so there is no model to choose for it.'

/**
 * WHAT THE OFFICE CHOSE FOR ONE RUN, as the message worker hands it to an adapter. Both null means
 * the office chose nothing, and the adapter reads its own environment as it always has.
 */
export interface TheOfficesChoice {
  model: string | null
  variant: string | null
}

/** The choice that says the office chose nothing. */
export const NOTHING_CHOSEN: TheOfficesChoice = { model: null, variant: null }
