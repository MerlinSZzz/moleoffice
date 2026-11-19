// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEXT ROUND OF A SANDBOX RUN: THE DOOR THAT ASKS FOR IT, AND THE OFFICE'S HALF OF STARTING IT. Wave 13j round
 * loop-2, step 2 of "a supervisor runs its own loop" (module HoSzb82KlTHJ; plan 4uSoJQ5RySTw, part "doors", D1). It
 * replaces the old start-after.sh. The rules: one run per round, and the next round starts on
 * the supervisor's word. src/shared/next-round.ts holds the shape.
 *
 * THE ASK, `askForTheNextRound`. Five may ask: the run's agent with its own key, its registered starter, a secretary
 * proved by its own key, the person, and the office itself. The office asks only in this process, for a fix round of a
 * red merge entry or for a hand-back's resolve brief, while ./the-office-asks-for-a-round.ts marks that one agent and
 * brief (wave 13u round 90), and for the next round of a run it saw sealed (./next-round-at-the-seal.ts, round 94). It is refused, in words, for a retired agent, a run already serving the
 * agent, a missing brief and a sandbox that is not the agent's. A count limit is only reminded of. The ask is kept on
 * the agent's last run started in a sandbox, as `nextRound`, and nothing is started by it. The ask works out the
 * Casting row the round starts on by the rule the start reads, refuses in words where the start would fail, and keeps
 * that row, or the model of the run it continues when no row is in force (wave 13n round BT). When the run's own program
 * is spent — its row is out until a time still to come, or the provider reports its limit — the ask draws the line's row
 * of another program, and the round starts a new conversation there from the brief. It is also refused while
 * the office starts no message worker, because then nothing would start it (`whyNoWorkerWouldStartIt`). A worker in
 * merges-only mode does start it (wave 13j round loop-3).
 *
 * AN ASK THAT NAMES INSIDE PACKAGES. In place of a brief, an ask may name inside packages of one line, each a task
 * record that holds one, with that line. The door checks each against the inside rows, read once: it must be one, for
 * that line, not handed back, and not taken inside by anybody but the asked agent. The door takes none inside. It then
 * writes the brief and its declaration into the sandbox's briefs folder (./the-office-writes-into-a-sandbox.ts), and the
 * round start reads the packages from the declaration. The reply names the other packages that wait for the line. An ask
 * that replaces one naming packages must name them all.
 *
 * THE START. Claude Code cannot be started inside a sandbox, so the message worker on the host starts the round with
 * the existing launcher, `node tools/sandbox.mjs round`. It reads `theRoundsToStart`, files a run of its own that runs
 * no model (the launcher run), and asks `startingTheNextRound`, which checks everything again and answers the previous
 * run's runtime, with the model of the Casting row the ask kept, read again by its id, or the model the ask kept when
 * no row was in force. A native row's selection is answered too, and the launcher is given it with --selection. The
 * run-models door answers the effort for that model. The launcher files the new run, derived from the last; the office
 * mints its key on that create (`theNextRoundThisRunStarts`, asked by the run-key door in api/records.ts). The worker
 * then says how the launcher ended (`theNextRoundsLauncherEnded`). `theRoundsToStart` leaves out an ask while a
 * process of the run that holds it still runs, as the launcher would refuse it, and writes on the ask that it waits;
 * after `A_ROUND_WAITS_FOR_ITS_RUN_AT_MOST_MINUTES` it writes the ask failed (wave 13u round 94).
 *
 * A REPAIR RESERVATION waits until its entry is merged and its landed receipt is proved on current main. It gets
 * a new directory and an exact cut; ordinary rounds omit those and keep their existing continuation behavior.
 *
 * THE EFFORT is not given to the launcher: the launcher asks the office for it itself, and passes the effort it is
 * answered where the program can take one. The starting entry records the office's answer to that same question (`theEffortTheLauncherIsAnswered`).
 *
 * WHAT IS NOT DONE HERE. A worker that restarts does not pick up a launcher run it started before; an ask left
 * `starting` with no launcher running may be asked again.
 */
import { sayInEnglish } from '@shared/i18n.ts'
import { createHash } from 'node:crypto'
import { aWaitingStarterChangeSays } from './agent-starter.ts'
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'

import { inEnglish, saying } from '@shared/dev-sayings.ts'
import { readQueuesAtTheSeal, thePartAtTheSeal } from '@shared/merge-queue-at-the-seal.ts'
import { readNextRoundAtTheSeal } from '@shared/next-round-at-the-seal.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import {
  isAPlainWord,
  NEXT_ROUND,
  NEXT_ROUND_HELD_BY,
  theClaudeSupervisorCapSays,
  readTheNextRound,
  ROUND_LAUNCHER_RUNTIME,
  type NextRoundAsker,
  type NextRoundState,
  type TheEffortTheLauncherIsAnswered,
  type TheNextRound,
} from '@shared/next-round.ts'
import { moleOffice, type AgentRuntime, type ParticipantRef } from '@shared/participants.ts'
import { theReminderAStartWithNoWorkAreaCarries } from '@shared/a-start-with-no-work-area.ts'
import { THE_SUPERVISOR, aRoleNeedsARegisteredWorkArea } from '@shared/roles.ts'
import { momentOfAnInstant, nowStamp, parseStoredStamp } from '@shared/time.ts'
import { readCastingOutUntil, readCastingProbability, type CastingRow, type CastingSelection } from '@shared/casting.ts'
import { castingModelName, type CastingLimits } from '@shared/casting-roll.ts'
import type { PanelRecord } from '@shared/types.ts'
import { theModelTheLauncherIsGiven, theRowAsTheAskReadIt, theStartOfTheRow, type TheRowAWorkerIsGiven } from '@shared/worker-runs.ts'
import { sqlite } from '../db/client.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { theKeyHolderIsTheRegisteredStarterOf } from './claims.ts'
import { claudeSupervisorsAtOnce } from './env.ts'
import { theRoundTheOfficeIsAsking } from './the-office-asks-for-a-round.ts'
import { nameOf, writeASystemLineToOne } from './groups.ts'
import { delegationColumn } from './delegation.ts'
import { A_BRIEFS_DECLARATION_ENDS, writeABriefIntoASandbox } from './the-office-writes-into-a-sandbox.ts'
import { theDeclarationOf, theWorkAreaInADeclaration } from '@shared/round-chapters/delivery.ts'
import { theAgentOfARun } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import {
  aFailedStartEmptiesTheAreaOfItsAsk,
  changeWorkArea,
  theDeclaredAreaWasSetSays,
  type RegisteredAgent,
} from './participants.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { theAgentTheKeyProves } from './the-agent-the-key-proves.ts'
import { theKeyProvesASecretary } from './the-key-proves-a-secretary.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theCardOfAgent } from '../db/the-card-of-agent.ts'
import { THE_PROGRAM_A_RUNTIME_RUNS } from '../../config/launcher-selection.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../../config/runtime-native-providers.mjs'
import { settingValue } from '../../config/settings.mjs'
import { getRecord, writeTheNextRound, type Actor } from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { theRepositoryNamed } from './the-repository-named.ts'
import { theOrderWritten } from '@shared/the-order-written.ts'
import { anyRecordForAgent } from '../db/any-record-for-agent.ts'
import { QUEUES_AT_THE_SEAL } from './merge-queue-fields-the-office-writes.ts'
import { tellTheSecretaryTheRoundStarted } from './the-line-next-round.ts'
import { retryTheRepairRound, theRepairRoundStarted } from './merge-state-machine.ts'
import { listResources, type ResourceReport } from './resources.ts'
import { readGit } from './resources.ts'
import { theCastingRowABuilderReads, theHoldOn, theKeptRowAtTheStart, theModelARunStartsWith } from './run-models.ts'
import { theModelsLimitedAt } from '../db/the-models-limited-at.ts'
import { theRowsInForce } from './the-rows-in-force.ts'
import { theSandboxesLoginForTheRouter } from './the-sandboxes-login-for-the-router.ts'
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'
import { readRunSeal, theBaseARunNames } from './sealed-tip.ts'
import { theSandboxFolderOf } from './the-sandbox-folder-of.ts'
import { runServing } from './worker.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { theProjectsTheWorkerServes } from './worker-runs.ts'
import { isOneOf, theFiledAliasesReadOnce } from './registry-aliases/runs.ts'

/** Who writes the office's own steps on the run: the office itself, as the account of how a round ended is written. */
function theOfficeWritesIt(): Actor { return { type: 'system', id: moleOffice().id } }
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/** Every refusal of this file, so each says what was not done. */
function refused(words: string, status: number): never {
  throw new PanelError(words, status)
}

// ================================================================================================== the agent and the asker

/** The agent a path segment names, by id or handle; a retired agent is refused here, by name. */
function theAgentAskedFor(reference: string, actor: Actor): RegisteredAgent {
  const named = theAgentAnArrivingReferenceNames(reference, 'reading', actor.keyHolder ?? null)
  const row = named === null ? null : readParticipant({ kind: 'agent', id: named.agent.id })
  if (row === null || !('startedBy' in row)) {
    refused(`Mole Office has no agent called "${reference}", so no next round was asked for. Nothing was written.`, 404)
  }
  if (row.retired === true) {
    refused(`${row.handle} (${row.id}) is retired, so no next round of it is started. Nothing was written.`, 409)
  }
  return row
}

/**
 * Which of the five who may ask this is, each proved by its own key or as the person is proved, or null. The office is
 * its own writer with no key, and only while it marks this agent: a request over HTTP that names the office's writer
 * meets the same rules as any other caller.
 */
function whoAsks(agent: RegisteredAgent, actor: Actor): TheNextRound['askedBy'] | null {
  const session = text(actor.sessionId) ?? undefined
  const asAgent = (id: string, as: NextRoundAsker): TheNextRound['askedBy'] => ({ who: { kind: 'agent', id }, as, ...(session === undefined ? {} : { session }) })
  const proved = theAgentTheKeyProves(actor)
  if (actor.type === 'agent' && proved === agent.id && actor.provedHolder === undefined) return asAgent(proved, 'the run’s agent')
  if (proved !== null && actor.keyHolder !== undefined && theKeyHolderIsTheRegisteredStarterOf(agent, actor.keyHolder)) return asAgent(proved, 'its starter')
  if (proved !== null && theKeyProvesASecretary(actor)) return asAgent(proved, 'a secretary')
  if (thePersonIsProved(actor)) return { who: { kind: 'person', id: actor.id }, as: 'the person', ...(session === undefined ? {} : { session }) }
  const office = theRoundTheOfficeIsAsking()
  if (office !== null && office.agent === agent.id && actor.type === THE_OFFICE.type && actor.id === THE_OFFICE.id && actor.provedBy === undefined && actor.keyHolder === undefined && actor.provedHolder === undefined) {
    return { who: moleOffice(), as: 'the office' }
  }
  return null
}

// ================================================================================================== the last run

/**
 * The agent's newest run in this project that was started in a sandbox, or null when it has none. The merge queue writes a
 * resolve brief into that run's sandbox with it (./merge-state-machine.ts `writeTheResolveBrief`), so the brief is where
 * this door reads one.
 *
 * NEWEST IN THE ORDER WRITTEN (./merge-queue.ts `theOrderWritten`), not by `created_at`: those words repeat in the hour
 * the clocks go back, and a run filed at 01:10 winter time sorted below one filed twenty minutes earlier, at 01:50 summer
 * time. A run of the agent with no create row in the change log has no place in that order, and the door answers 500
 * naming it rather than read the time in words instead.
 *
 * A run stored under an alias filed for the agent is the agent's run: the statement asks for each of its ids, and the
 * agent a run serves is compared by canonical id.
 */
export function theLastSandboxRunOf(agentId: string, handle: string, workspaceId: string): PanelRecord | null {
  return theNewestRunAmong(agentId, handle, { workspaceId })
}

/**
 * The agent's newest run of any kind, in any project, or null when it has none: a run with no sandbox counts, so a round
 * somebody started by hand is seen (wave 13r round AX). Newest in the order written, as `theLastSandboxRunOf` reads it.
 */
export function theNewestRunOf(agentId: string, handle: string): PanelRecord | null {
  return theNewestRunAmong(agentId, handle, null)
}

/** The agent's newest run: in one project and started in a sandbox, or, with null, any run anywhere. */
function theNewestRunAmong(agentId: string, handle: string, inASandboxIn: { workspaceId: string } | null): PanelRecord | null {
  const ids = theFiledAliasesReadOnce(sqlite).everyIdOf(agentId)
  const rows = sqlite
    .prepare(
      `SELECT r.id AS id, ${theOrderWritten('r')} AS written FROM records r WHERE r.kind = 'session' AND r.deleted_at IS NULL ` +
        (inASandboxIn === null ? '' : "AND r.workspace_id = ? AND json_extract(r.data, '$.sandbox') IS NOT NULL ") +
        `AND (json_extract(r.data, '$.servingAgentId') ${isOneOf(ids)} OR json_extract(r.data, '$.servingAgent') = ?) ` +
        'ORDER BY written DESC NULLS FIRST, r.rowid DESC LIMIT 25',
    )
    .all(...(inASandboxIn === null ? [] : [inASandboxIn.workspaceId]), ...ids, handle) as { id: string; written: number | null }[]
  for (const row of rows) {
    const run = getRecord(row.id)
    if (run === null || theAgentARunServes(run.data)?.id !== ids[0]) continue
    if (row.written === null) {
      throw new PanelError(
        `Run ${row.id} has no create row in the change log, so the order it was written in is not recorded. The office does not ` +
          `take an agent's newest ${inASandboxIn === null ? '' : 'sandbox '}run by the time in words instead, because that time repeats when the clocks go back.`,
        500,
      )
    }
    return run
  }
  return null
}

/**
 * THE SANDBOX THE OFFICE VOUCHES FOR ON A RUN: its folder, when a container row of the ledger names it, its name and its
 * container. Null when it cannot vouch for one. The worker-run door (lib/worker-runs.ts) reads a supervisor's run with it.
 */
export function theSandboxTheOfficeVouchesFor(run: PanelRecord): TheNextRound['sandbox'] | null {
  const folder = theSandboxFolderOf(run.data)
  const container = isObject(run.data['sandbox']) ? text(run.data['sandbox']['container']) : null
  return folder === null || container === null ? null : { folder, instance: basename(folder), container }
}

/** The sandbox the office vouches for on that run, or a refusal saying why it cannot. */
function theSandboxOf(run: PanelRecord, handle: string): TheNextRound['sandbox'] {
  const vouched = theSandboxTheOfficeVouchesFor(run)
  if (vouched === null) {
    refused(
      `Run ${run.id}, the last of ${handle} started in a sandbox, names a sandbox the office cannot vouch for: its folder ` +
        "is not one a container row of the ledger names. The round would run in a sandbox that may not be the agent's. " +
        'Nothing was written.',
      409,
    )
  }
  return vouched
}

/** The brief, read and hashed, or a refusal: it must be a file inside the sandbox folder. The worker-run door reads it too. */
export function theBriefAt(path: string, folder: string): TheNextRound['brief'] {
  return theBriefAndItsWordsAt(path, folder).brief
}

/** theBriefAt with the words it read, for the worker-run door, which reads the difficulty a brief marks. */
export function theBriefAndItsWordsAt(path: string, folder: string): { brief: TheNextRound['brief']; words: string } {
  if (!isAbsolute(path)) refused(`The brief "${path}" is not an absolute path. Give the path of a file inside ${folder}. Nothing was written.`, 400)
  let real: string
  let inside: string
  try {
    real = realpathSync(path)
    inside = realpathSync(folder)
  } catch {
    refused(`There is no brief at ${path}. Nothing was written.`, 409)
  }
  if (!real.startsWith(inside + sep)) {
    refused(
      `The brief ${path} is not inside the sandbox folder ${folder}. The office reads a brief only from the sandbox ` +
        'the run it starts will run in. Put the brief in that folder and ask again. Nothing was written.',
      409,
    )
  }
  if (!statSync(real).isFile()) refused(`The brief ${path} is not a file. Nothing was written.`, 409)
  const bytes = readFileSync(real)
  return { brief: { path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }, words: bytes.toString('utf8') }
}

/**
 * THE WORK AREA THE BRIEF'S DECLARATION NAMES, read by the rule the brief is read by, for both doors where a start is
 * asked. The declaration is opened only when it is a file inside the sandbox folder by its real path, so a link out of
 * the folder, or anything that is not a file, is refused before it is read. A refusal quotes nothing from the file. A
 * brief with no declaration, or one that names no work area, answers a work area of null, and the ask goes on as before.
 */
export function theWorkAreaDeclaredBeside(brief: string, folder: string): { file: string; workArea: string[] | null } {
  const file = theDeclarationOf(brief)
  if (lstatSync(file, { throwIfNoEntry: false }) === undefined) return { file, workArea: null }
  let real: string
  try {
    real = realpathSync(file)
  } catch {
    refused(`The declaration ${file} is a link to nothing that can be read. Nothing was written.`, 409)
  }
  if (!real.startsWith(realpathSync(folder) + sep)) {
    refused(
      `The declaration ${file} is not inside the sandbox folder ${folder}. The office reads a declaration only from the ` +
        'sandbox the run it starts will run in, as it reads the brief. Nothing was written.',
      409,
    )
  }
  if (!statSync(real).isFile()) refused(`The declaration ${file} is not a file. Nothing was written.`, 409)
  const declared = theWorkAreaInADeclaration(file, readFileSync(real, 'utf8'))
  if ('refused' in declared) refused(`${declared.refused} Nothing was written.`, 400)
  return declared
}

/**
 * WHY NO WORKER OF THIS OFFICE WOULD START A ROUND, or null because one would. A worker that takes the queue
 * (`MOLE_OFFICE_MESSAGE_WORKER=on`) starts rounds, and so does a worker in merges-only mode: `onePass` in
 * src/worker/index.ts tends the rounds in both. With `off` the server starts no worker, so an ask nothing would start
 * is refused rather than kept. Read through the same declaration the server reads when it starts the worker.
 *
 * WHY MERGES-ONLY MODE STARTS ROUNDS (wave 13j round loop-3). Two decisions. A supervisor's next
 * round starts on the supervisor's word. Merges-only mode exists so that a message to an agent nobody
 * holds does not start a run by itself: the rule is to ask first (criterion M78). A round asked through this
 * door has been asked for, so the mode starts it. It still starts no run for a message, and `off` still starts
 * nothing. This reading was decided as engineering, in the brief of round loop-3 (from run ALi7EJl2rpIx). It
 * can be undone, and the owner may change it.
 */
function whyNoWorkerWouldStartIt(): string | null {
  const mode = settingValue('MOLE_OFFICE_MESSAGE_WORKER')
  if (mode === 'on' || mode === 'merges-only') return null
  return `The office starts no message worker (MOLE_OFFICE_MESSAGE_WORKER=${String(mode)}), so nothing would start this round.`
}

/** Whether a launcher run is still going: its record says running. */
export function theLauncherRunIsGoing(wrapper: string): boolean {
  return getRecord(wrapper)?.data['state'] === 'running'
}

// ================================================================================================== the ask's own shape

/** What an ask may name: a brief, or inside packages with their line. Either may name the sandbox. */
export type TheNextRoundAskNames = { brief: string } | { delegations: string[]; line: string }

const THE_FIELDS_AN_ASK_TAKES = ['brief', 'sandbox', 'delegations', 'line']

export const A_NEXT_ROUND_ASK_IS_AN_OBJECT =
  'The next round is asked for with a JSON object: {"brief", "sandbox"} or {"delegations", "line", "sandbox"}, the sandbox optional. Nothing was written.'

export function anAskTakesNoSuchField(key: string): string {
  return `The next round asked for has a field "${key}", and the ask takes no field by that name. It takes "brief" and "sandbox", or "delegations", "line" and "sandbox". Nothing was written.`
}

export const AN_ASK_NAMES_A_BRIEF_OR_PACKAGES =
  'The next round asked for names both a brief and packages. Name a brief, or name packages with their line, and not both. Nothing was written.'

export const AN_ASK_NAMES_NEITHER_A_BRIEF_NOR_PACKAGES =
  'The next round asked for names neither a brief nor packages. Name a brief, or name packages with their line. Nothing was written.'

export const A_LINE_IS_NAMED_ONLY_WITH_PACKAGES =
  'The next round asked for names a line and no packages. A line is named only with the packages the round takes for it. Nothing was written.'

export const PACKAGES_ARE_NAMED_WITH_THEIR_LINE =
  'The next round asked for names packages and no line. Name the line the round takes them for. Nothing was written.'

export const PACKAGES_ARE_A_LIST_OF_IDS =
  '"delegations" is a list of one or more task record ids, and this ask gave something else. Nothing was written.'

const shown = (value: unknown): string => JSON.stringify(value) ?? String(value)

export function aPackageIdIsAPlainWord(value: unknown): string {
  return `The package ${shown(value)} is not a task record id as an ask names one: a word with no blank around it. Nothing was written.`
}

export function aPackageIsNamedOnce(id: string): string {
  return `The next round asked for names the package ${id} more than once. Name each package once. Nothing was written.`
}

export function aLineIsAPlainWord(value: unknown): string {
  return `The line ${shown(value)} is not a line as an ask names one: a word with no blank around it. Nothing was written.`
}

export const A_BRIEF_IS_A_PATH_AS_TEXT =
  '"brief" is the absolute path of a file inside the sandbox folder, as text, and this ask gave something else. Nothing was written.'

export const A_SANDBOX_IS_NAMED_AS_TEXT =
  '"sandbox" is the sandbox folder or its name, as text, and this ask gave something else. Nothing was written.'

/**
 * THE ASK AS IT WAS SENT, read into one of its two shapes, or a 400 saying what was wrong. A brief and the sandbox are
 * trimmed, as the door always took them. A package id and the line are taken only as words with no blank around them,
 * the rule the round start reads its declaration by, so the office never writes one the round start would refuse.
 */
export function readTheNextRoundAsk(body: unknown): TheNextRoundAskNames & { sandbox?: string } {
  const wrong = (words: string): never => refused(words, 400)
  if (!isObject(body)) return wrong(A_NEXT_ROUND_ASK_IS_AN_OBJECT)
  const unknown = Object.keys(body).find((key) => !THE_FIELDS_AN_ASK_TAKES.includes(key))
  if (unknown !== undefined) return wrong(anAskTakesNoSuchField(unknown))
  let sandbox: string | undefined
  if (Object.hasOwn(body, 'sandbox')) {
    sandbox = text(body['sandbox'])?.trim() ?? wrong(A_SANDBOX_IS_NAMED_AS_TEXT)
  }
  const named = sandbox === undefined ? {} : { sandbox }
  const hasBrief = Object.hasOwn(body, 'brief')
  const hasPackages = Object.hasOwn(body, 'delegations')
  if (hasBrief && hasPackages) return wrong(AN_ASK_NAMES_A_BRIEF_OR_PACKAGES)
  if (hasPackages) {
    if (!Object.hasOwn(body, 'line')) return wrong(PACKAGES_ARE_NAMED_WITH_THEIR_LINE)
    const delegations = body['delegations']
    if (!Array.isArray(delegations) || delegations.length === 0) return wrong(PACKAGES_ARE_A_LIST_OF_IDS)
    const notAWord = delegations.find((id) => !isAPlainWord(id))
    if (notAWord !== undefined) return wrong(aPackageIdIsAPlainWord(notAWord))
    const twice = (delegations as string[]).find((id, at) => delegations.indexOf(id) !== at)
    if (twice !== undefined) return wrong(aPackageIsNamedOnce(twice))
    const line = body['line']
    if (!isAPlainWord(line)) return wrong(aLineIsAPlainWord(line))
    return { delegations: delegations as string[], line, ...named }
  }
  if (Object.hasOwn(body, 'line')) return wrong(A_LINE_IS_NAMED_ONLY_WITH_PACKAGES)
  if (!hasBrief) return wrong(AN_ASK_NAMES_NEITHER_A_BRIEF_NOR_PACKAGES)
  const brief = text(body['brief'])?.trim() ?? wrong(A_BRIEF_IS_A_PATH_AS_TEXT)
  return { brief, ...named }
}

// ================================================================================================== the packages an ask names

/** A package as the brief and the reply name it. */
export interface ANamedPackage { id: string; title: string }

export function aPackageIsNotInsideSays(id: string): string {
  return `No task record in this project with the id ${id} holds an inside package, so a round cannot take it. Nothing was written.`
}

export function aPackageCouldNotBeToldSays(id: string, couldNotRead: readonly { recordId: string }[]): string {
  return (
    `${id} is not among the inside packages the office could read. The office could not read the package on ` +
    `${couldNotRead.map((one) => one.recordId).join(', ')}, so it cannot say whether ${id} is one. Nothing was written.`
  )
}

export function aPackageIsForOtherLinesSays(id: string, title: string, line: string, lines: readonly string[]): string {
  return `The package ${id}, "${title}", is for ${lines.length === 0 ? 'no line' : `line ${lines.join(', line ')}`}, and not for line ${line}. Nothing was written.`
}

export function aPackageWasHandedBackSays(id: string, title: string, at: string | null): string {
  return `The package ${id}, "${title}", was handed back${at === null ? '' : ` at ${at}`}, so a round cannot take it. Nothing was written.`
}

export function aPackageWasTakenByAnotherSays(id: string, title: string, takenBy: string, handle: string): string {
  return `The package ${id}, "${title}", was taken inside by ${takenBy}, and not by ${handle}, so ${handle}'s round cannot take it. Nothing was written.`
}

export function aReplacingAskDropsPackagesSays(run: string, kept: readonly string[], dropped: readonly string[]): string {
  return (
    `The ask kept on run ${run} names the packages ${kept.join(', ')}, and this ask does not name ${dropped.join(', ')}. ` +
    'A new ask must name every package the kept ask names to replace it. Nothing was written.'
  )
}

/** The words of the brief the office writes for an ask that names packages. */
export function theWordsOfAPackagesBrief(input: {
  handle: string; run: string; line: string; packages: readonly ANamedPackage[]; askedBy: string; as: NextRoundAsker; askedAt: string; declaration: string
}): string {
  const { packages } = input
  return [
    `# The next round of ${input.handle}: inside packages for line ${input.line}`,
    '',
    `This round takes ${packages.length === 1 ? 'one inside package' : `${String(packages.length)} inside packages`} for line ${input.line}:`,
    '',
    ...packages.map((one) => `- ${one.id}: ${one.title}`),
    '',
    `${input.askedBy} asked for this round at ${input.askedAt}, as ${input.as}. It continues run ${input.run}.`,
    '',
    "The round-start pack carries each package's points and materials, and it says the first steps. Start there.",
    '',
    `The declaration beside this brief, ${input.declaration}, names the line and the packages. The round start reads them from it.`,
    '',
  ].join('\n')
}

/** The declaration beside that brief, exactly the line and the packages in the ask's order. */
export function theDeclarationOfAPackagesRound(line: string, delegations: readonly string[]): string {
  return `${JSON.stringify({ line, delegations }, null, 2)}\n`
}

export function theFilesTheAskWroteSay(brief: string, declaration: string): string {
  return `The office wrote the brief ${brief} and its declaration ${declaration}.`
}

export function theFilesLeftBehindSay(brief: string, declaration: string, run: string, why: string): string {
  return (
    `The office wrote the brief ${brief} and its declaration ${declaration}, and then could not keep the ask on run ${run}: ` +
    `${why} The two files are left in the briefs folder. Nothing was written on the run.`
  )
}

/** The other inside packages that wait for the line, or that none waits. */
export function theOtherPackagesWaitingSay(line: string, waiting: readonly ANamedPackage[]): string {
  if (waiting.length === 0) return `No other inside package waits for line ${line}.`
  const listed = waiting.map((one) => `${one.id} ("${one.title}")`).join(', ')
  return (
    `${waiting.length === 1 ? 'One other inside package waits' : `${String(waiting.length)} other inside packages wait`} for line ${line}: ${listed}. ` +
    'Take as many of them as fit: merge the same work into one round, and give independent work to different workers.'
  )
}

/**
 * THE PACKAGES AN ASK NAMES, checked against the inside rows, read once: each must be one, for the asked line, not handed
 * back, and not taken inside by anybody but the asked agent. Answers them in the ask's order, with the other packages
 * that wait for the line: not taken, not handed back and not named here.
 */
function thePackagesTheAskNames(ids: readonly string[], line: string, agent: RegisteredAgent, workspaceId: string): { named: ANamedPackage[]; waiting: ANamedPackage[] } {
  const reading = delegationColumn(workspaceId, true)
  const byId = new Map(reading.rows.map((row) => [row.recordId, row]))
  const named = ids.map((id) => {
    const row = byId.get(id)
    if (row === undefined || row.inside === null) {
      refused(reading.couldNotRead.length === 0 ? aPackageIsNotInsideSays(id) : aPackageCouldNotBeToldSays(id, reading.couldNotRead), 409)
    }
    if (!row.lines.includes(line)) refused(aPackageIsForOtherLinesSays(id, row.title, line, row.lines), 409)
    if (row.inside.handedBack) refused(aPackageWasHandedBackSays(id, row.title, row.inside.handedBackAt), 409)
    const takenBy = row.inside.takenBy
    if (takenBy !== null && !(takenBy.kind === 'agent' && takenBy.id === agent.id)) {
      refused(aPackageWasTakenByAnotherSays(id, row.title, nameOf(takenBy), agent.handle), 409)
    }
    return { id, title: row.title }
  })
  const waiting = reading.rows
    .filter((row) => row.inside !== null && row.inside.takenBy === null && !row.inside.handedBack && row.lines.includes(line) && !ids.includes(row.recordId))
    .map((row) => ({ id: row.recordId, title: row.title }))
  return { named, waiting }
}

// ================================================================================================== the ask

export interface TheNextRoundAsked {
  run: string
  nextRound: TheNextRound
  says: string
  limits: { says: string[] }
}

/**
 * ASK FOR THE NEXT ROUND OF AN AGENT. Writes `nextRound` on its last sandbox run as the asker, in state `wanted`, and
 * starts nothing. `sandbox`, when given, is the folder or its name, and must be the one the last run was started in.
 * An ask that names packages in place of a brief has the brief and its declaration written by the office first.
 */
export function askForTheNextRound(input: TheNextRoundAskNames & { agent: string; sandbox?: string; workspaceId: string; actor: Actor }): TheNextRoundAsked {
  const { actor, workspaceId } = input
  const askedBrief = 'brief' in input ? input.brief : null
  const agent = theAgentAskedFor(input.agent, actor)
  const askedBy = whoAsks(agent, actor)
  if (askedBy === null) {
    refused(
      `The next round of ${agent.handle} is asked for by the agent with its own key, its registered starter, a secretary ` +
        `proved by its own key, or the person, and this request was made by "${actor.id}". Nothing was written.`,
      403,
    )
  }
  if (askedBy.as === 'the office' && theRoundTheOfficeIsAsking()?.brief !== askedBrief) {
    refused(`The office asked for the next round of ${agent.handle} with a brief other than the one it marked. Nothing was written.`, 403)
  }
  const noWorker = whyNoWorkerWouldStartIt()
  if (noWorker !== null) refused(`${noWorker} Nothing was written.`, 409)
  const last = theLastSandboxRunOf(agent.id, agent.handle, workspaceId)
  if (last === null) {
    refused(
      `${agent.handle} has no run in this project that was started in a sandbox, so there is no round to continue. Start ` +
        'its first round with node tools/sandbox.mjs worker. Nothing was written.',
      409,
    )
  }
  const sandbox = theSandboxOf(last, agent.handle)
  if (input.sandbox !== undefined && input.sandbox !== sandbox.folder && input.sandbox !== sandbox.instance) {
    refused(
      `The sandbox "${input.sandbox}" is not ${agent.handle}'s: its last run, ${last.id}, was started in ${sandbox.folder}. ` +
        'Nothing was written.',
      409,
    )
  }
  const briefAsked = askedBrief === null ? null : theBriefAt(askedBrief, sandbox.folder)
  // THE WORK AREA THE ASKED BRIEF'S DECLARATION NAMES, read from inside the sandbox folder as the brief is, and checked as
  // the launcher checks it. It is set with the ask below. A brief the office writes for packages declares none.
  const declared = askedBrief === null ? null : theWorkAreaDeclaredBeside(askedBrief, sandbox.folder)
  const serving = runServing(agent.id, workspaceId)
  if (serving !== null && serving !== text(actor.sessionId)) {
    refused(
      `Run ${serving} is already serving ${agent.handle}, so a next round would be a second run of it. Ask again when ` +
        'that run has ended. Nothing was written.',
      409,
    )
  }
  const before = readTheNextRound(last.data[NEXT_ROUND])
  if (before?.state === 'started') {
    refused(`Run ${last.id} already started its next round, run ${before.started?.run ?? 'unknown'}. Nothing was written.`, 409)
  }
  if (before?.state === 'starting' && before.starting !== undefined && theLauncherRunIsGoing(before.starting.wrapper)) {
    refused(
      `The next round of run ${last.id} is being started now, by the launcher run ${before.starting.wrapper}. Nothing was written.`,
      409,
    )
  }
  // THE ROW THE ROUND STARTS ON, worked out now by the rule the start reads again, so an ask the start would fail is
  // refused here in the same words. The ask keeps the row as it read it, or the model it continues when none is in force.
  const chosen = theModelARoundStartsOn(last, agent, workspaceId, theRowTheAskReads(last, agent.id, workspaceId))
  if ('fails' in chosen) refused(`${chosen.fails} Nothing was written.`, 409)
  const replaces = before !== null && (before.state === 'wanted' || before.state === 'starting')
  const asked = 'delegations' in input ? { delegations: input.delegations, line: input.line } : null
  // AN ASK THAT REPLACES ONE NAMING PACKAGES NAMES THEM ALL, a brief ask as well, so no package a round was asked to take
  // is dropped by a later ask that did not name it.
  if (replaces && before.delegations !== undefined) {
    const dropped = before.delegations.filter((id) => !(asked?.delegations ?? []).includes(id))
    if (dropped.length > 0) refused(aReplacingAskDropsPackagesSays(last.id, before.delegations, dropped), 409)
  }
  const packages = asked === null ? null : thePackagesTheAskNames(asked.delegations, asked.line, agent, workspaceId)
  const askedAt = nowStamp()
  // THE BRIEF OF AN ASK THAT NAMES PACKAGES is written by the office, with its declaration beside it, and then read as a
  // brief named in an ask is read, so the round start meets the same pointer and hash.
  let written: { brief: string; declaration: string } | null = null
  if (asked !== null && packages !== null) {
    const files = writeABriefIntoASandbox(
      sandbox.folder,
      `next-round-${last.id}`,
      (name) => theWordsOfAPackagesBrief({
        handle: agent.handle, run: last.id, line: asked.line, packages: packages.named,
        askedBy: nameOf(askedBy.who), as: askedBy.as, askedAt, declaration: `${name}.md${A_BRIEFS_DECLARATION_ENDS}`,
      }),
      () => theDeclarationOfAPackagesRound(asked.line, asked.delegations),
    )
    if ('refused' in files) refused(files.refused, 409)
    if (files.declaration === undefined) throw new Error(`The office wrote the brief ${files.path} and no declaration beside it, though it gave the declaration's words.`)
    written = { brief: files.path, declaration: files.declaration }
  }
  const leftBehind = (error: unknown): never => {
    if (written === null) throw error
    const why = error instanceof Error ? error.message : String(error)
    return refused(theFilesLeftBehindSay(written.brief, written.declaration, last.id, why), error instanceof PanelError ? error.status : 500)
  }
  let brief: TheNextRound['brief']
  try { brief = briefAsked ?? theBriefAt(written!.brief, sandbox.folder) } catch (error) { return leftBehind(error) }
  const nextRound: TheNextRound = {
    state: 'wanted',
    askedAt,
    askedBy,
    brief,
    sandbox,
    ...(askedBy.as !== 'the office' || theRoundTheOfficeIsAsking()?.repair === undefined ? {} : { repair: theRoundTheOfficeIsAsking()!.repair! }),
    ...(serving === null ? {} : { after: serving }),
    ...(replaces ? { replaced: { askedAt: before.askedAt, askedBy: before.askedBy.who.id } } : {}),
    ...(chosen.row === null ? { row: null, model: chosen.model } : { row: chosen.row }),
    ...(chosen.switched === undefined ? {} : { switched: chosen.switched }),
    ...(asked === null ? {} : { delegations: asked.delegations, line: asked.line }),
  }
  // A DECLARED AREA IS SET WITH THE ASK, in one write and in the asker's name, through the change every area goes through:
  // an asker who may not change the agent's area is refused there, and the ask is not kept either. The office never sets
  // one: the launcher it runs compares the agent's area with the declaration and stops on a difference.
  const area = declared === null || askedBy.as === 'the office' ? null : declared.workArea
  let set: RegisteredAgent | null = null
  try {
    set = sqlite.transaction(() => {
      writeTheNextRound(last.id, nextRound as unknown as Record<string, unknown>, actor)
      if (area === null) return null
      return changeWorkArea(agent.id, workspaceId, area, `The brief ${askedBrief} declares this work area for the next round asked on run ${last.id}.`, actor, {
        declared: { brief: askedBrief!, door: 'next-round', askedOn: last.id, askedAt },
      })
    })()
  } catch (error) { return leftBehind(error) }
  if (replaces && before.repair !== undefined && nextRound.repair?.entry !== before.repair.entry) {
    retryTheRepairRound(before.repair.entry, last.id, workspaceId, sayInEnglish('repairLaunch.replaced'), repairDue(before))
  }
  // A START WITH NO WORK AREA SAYS SO, AND HOW ITS SUPERVISOR GIVES IT ONE (the sentences' own export).
  const noWorkAreaReminder =
    set === null && (agent.workArea === null || agent.workArea.length === 0) && theRoleCardsAreRead() &&
    aRoleNeedsARegisteredWorkArea(theRoleCards(), agent.role)
      ? ` ${theReminderAStartWithNoWorkAreaCarries(agent.handle)}`
      : ''
  return {
    run: last.id,
    nextRound,
    says:
      `The next round of ${agent.handle} is asked for, after run ${last.id}, in sandbox ${sandbox.instance}. Nothing has ` +
      (serving === null
        ? 'started yet. The message worker tries to start it on a later pass, with node tools/sandbox.mjs round.'
        : `started yet. The message worker tries to start it on a pass after run ${serving} has ended.`) +
      ` Run ${last.id}'s nextRound field says where the ask is.` +
      ` ${chosen.modelSays} ${chosen.row === null ? 'The start keeps that model, and a row added before the round starts is not taken.' : 'The start reads that row again by its id, and a changed, held or removed row fails the start.'}` +
      (replaces ? ` It replaces the ask ${before.askedBy.who.id} made at ${before.askedAt}.` : '') +
      (written === null || asked === null || packages === null
        ? ''
        : ` ${theFilesTheAskWroteSay(written.brief, written.declaration)} ${theOtherPackagesWaitingSay(asked.line, packages.waiting)}`) +
      (set === null || declared === null ? '' : ` ${theDeclaredAreaWasSetSays(agent.handle, set.workArea ?? [], declared.file, nameOf(askedBy.who))}`) +
      noWorkAreaReminder,
    limits: {
      says: [
        "A supervisor's next round starts on the supervisor's own word.",
        'This door does not count rounds.',
        'The count limits on runs in the main world remind and never refuse.',
        `Those limits count only runs started on the host. This round runs in sandbox ${sandbox.instance}, so it is ` +
          'not counted.',
        'Nothing here is refused for a count.',
      ],
    },
  }
}

/** The cap pauses the launch wait; a retry can carry that time onto the entry's wait. */
function repairDue(round: TheNextRound): number | null {
  if (round.repair === undefined) return null
  const due = momentOfAnInstant(round.repair.dueAt)
  if (due === null) return null
  const held = round.repair.capHeldMs ?? 0
  const current = round.repair.capHeldSince === undefined ? 0 : Math.max(0, Date.now() - round.repair.capHeldSince)
  return due + held + current
}

/** Record the end of a cap hold before some other condition can hold the round. */
function endRepairCapHold(round: TheNextRound): TheNextRound {
  if (round.repair?.capHeldSince === undefined) return round
  const { capHeldSince, ...repair } = round.repair
  return { ...round, repair: { ...repair, capHeldMs: (repair.capHeldMs ?? 0) + Math.max(0, Date.now() - capHeldSince) } }
}

/** Recheck the exact office reservation at admission and landing, without inventing a running repair. */
export function requireTheRepairReservation(input: { holder: string; entry: string; brief: string; dueAt: string; workspaceId: string }): void {
  const record = getRecord(input.holder), round = record === null ? null : readTheNextRound(record.data[NEXT_ROUND])
  const due = round === null ? null : repairDue(round)
  const agent = record === null ? null : theAgentARunServes(record.data)
  const same = record?.workspaceId === input.workspaceId && round?.state === 'wanted' && round.askedBy.as === 'the office' &&
    round.repair?.entry === input.entry && round.repair.dueAt === input.dueAt && round.brief.path === input.brief &&
    agent !== null && theLastSandboxRunOf(agent.id, agent.handle, input.workspaceId)?.id === record.id
  if (!same || due === null || Date.now() >= due) refused(`The repair reservation for merge entry ${input.entry} expired, failed, or was replaced. Nothing was started.`, 409)
  const brief = theBriefAt(round!.brief.path, round!.sandbox.folder)
  if (brief.sha256 !== round!.brief.sha256) refused(`The repair reservation's brief changed for merge entry ${input.entry}. Nothing was started.`, 409)
}

/** A repair waits for a recorded landing, and expires rather than holding an ask forever. */
function itWaitsForLanding(record: PanelRecord): boolean {
  const round = readTheNextRound(record.data[NEXT_ROUND])
  if (round?.repair === undefined) return false
  const entry = getRecord(round.repair.entry), due = repairDue(round)
  const ended = entry === null || entry.workspaceId !== record.workspaceId || entry.kind !== 'merge_entry' || ['bounced', 'withdrawn'].includes(String(entry.data['state']))
  if (ended || due === null || Date.now() >= due) {
    const reason = ended
      ? entry === null || entry.workspaceId !== record.workspaceId || entry.kind !== 'merge_entry'
        ? sayInEnglish('repairLaunch.entryMissing')
        : sayInEnglish('repairLaunch.entryEnded', { state: String(entry.data['state']) })
      : `The repair reservation for merge entry ${round.repair.entry} ended before its launch.`
    try { itFailed(record, round, reason, 409) } catch (error) { if (!(error instanceof PanelError)) throw error }
    return true
  }
  return entry.data['state'] !== 'merged'
}

/** Prove the receipt's landed commit is on current local main; use that exact current commit, never a ref name. */
function repairCut(record: PanelRecord, round: TheNextRound): string {
  const entry = getRecord(round.repair!.entry)
  if (entry === null || entry.workspaceId !== record.workspaceId || entry.kind !== 'merge_entry' || entry.data['state'] !== 'merged') {
    refused(`The repair for merge entry ${round.repair!.entry} waits for its landing on main. Nothing was started.`, 409)
  }
  const due = repairDue(round)
  if (due === null || Date.now() >= due) return itFailed(record, round, 'The repair launch reservation expired.', 409)
  const receipt = isObject(entry.data['integrated']) ? entry.data['integrated'] : {}
  const changeset = isObject(entry.data['changeset']) ? entry.data['changeset'] : {}
  const landed = text(receipt['mainAfter']), root = text(changeset['root'])
  try {
    if (landed === null || root === null || !/^[a-f0-9]{40}$/.test(landed)) throw new Error('the landed receipt or repository is missing')
    const main = readGit(root, ['rev-parse', '--verify', 'refs/heads/main^{commit}']).toString('utf8').trim()
    readGit(root, ['merge-base', '--is-ancestor', landed, main])
    return main
  } catch (error) {
    return itFailed(record, round, `The repair base cannot be proved on current main for merge entry ${entry.id}: ${error instanceof Error ? error.message : String(error)}`, 409)
  }
}

/** An office ask written by the seal decision, distinct from a hand ask or a release ask. */
function isAnAskAtTheSeal(record: PanelRecord, round: TheNextRound): boolean {
  const note = readNextRoundAtTheSeal(thePartAtTheSeal(record.data, 'nextRound'))
  return round.askedBy.as === 'the office' && round.repair === undefined && round.replaced === undefined && note?.outcome === 'asked' && note.moment === 'seal' && round.askedAt <= note.at && round.brief.path === note.brief.path && round.brief.sha256 === note.brief.sha256
}

/** Read the exact current main of the repository the line names. */
function theLinesCurrentMain(record: PanelRecord, agent: { id: string }): { root: string; main: string } {
  const bound = anyRecordForAgent(agent.id)
  const line = bound === null ? null : readQueuesAtTheSeal(getRecord(bound.record)?.data[QUEUES_AT_THE_SEAL])
  if (line?.repository === undefined) throw new Error('the line names no repository')
  const repository = theRepositoryNamed(line.repository, record.workspaceId)
  if (repository.root === null) throw new Error('the repository names no checkout')
  const main = readGit(repository.root, ['rev-parse', '--verify', 'refs/heads/main^{commit}']).toString('utf8').trim()
  return { root: repository.root, main }
}

// ================================================================================================== the worker's half

export interface ARoundToStart {
  run: string
  agentId: string
  handle: string
  runtime: string | null
}

/**
 * HOW LONG A NEXT ROUND WAITS FOR A PROCESS OF THE RUN BEFORE IT, in minutes, before the ask is failed (wave 13u round
 * 94). A run that is sealed may still have its program running for a while after the seal.
 */
export const A_ROUND_WAITS_FOR_ITS_RUN_AT_MOST_MINUTES = 20

/** A process row that is open and that the ledger does not read as gone: it still runs, or nobody can say it has ended. */
const aProcessRowStillRuns = (row: ResourceReport): boolean => row.releasedAt === null && row.liveness.state !== 'gone'

/**
 * THE PROCESS ROWS OF A RUN THAT HOLD ITS NEXT ROUND BACK: the open rows the ledger does not read as gone, which are the
 * ones the launcher's own check refuses a start for (`nothingOfItStillRuns` in tools/sandbox.mjs). A row that cannot be
 * checked holds it back too, because nobody can say it has ended.
 */
function theProcessesStillRunning(runId: string, workspaceId: string): string[] {
  return listResources({ workspaceId, sessionRecordId: runId, type: 'process' }).flatMap((row) => {
    const { liveness } = row
    if (!aProcessRowStillRuns(row)) return []
    const which = `process row ${row.id}, host pid ${row.key} group ${row.pgid ?? 'not recorded'}, `
    return [which + (liveness.state === 'unknown' ? `that cannot be checked (${liveness.reason})` : `that still runs (${liveness.detail})`)]
  })
}

/**
 * AN ASK WHOSE RUN STILL HAS A PROCESS GOING is left out of the list and waits. The first pass that finds it writes
 * `waits`, from when; a pass after the limit writes it failed, with the rows, and tells the asker. Answers whether it
 * waits, which it also does once it has failed.
 */
function itWaitsForItsRun(record: PanelRecord, workspaceId: string): boolean {
  const nextRound = readTheNextRound(record.data[NEXT_ROUND])
  if (nextRound === null) return false
  const running = theProcessesStillRunning(record.id, workspaceId)
  if (running.length === 0) return false
  const rows = `Run ${record.id} has ${running.join('; ')}.`
  const { held, ...withoutHold } = nextRound
  if (nextRound.waits === undefined) {
    const says = `${rows} The launcher starts a round only once the run before it has ended.`
    writeTheNextRound(record.id, { ...withoutHold, waits: { since: nowStamp(), says } } as unknown as Record<string, unknown>, theOfficeWritesIt())
    return true
  }
  const since = parseStoredStamp(nextRound.waits.since)
  const limit = A_ROUND_WAITS_FOR_ITS_RUN_AT_MOST_MINUTES
  if (since !== null && Date.now() - since < limit * 60_000) {
    if (held !== undefined) writeTheNextRound(record.id, withoutHold as unknown as Record<string, unknown>, theOfficeWritesIt())
    return true
  }
  const says =
    since === null
      ? `The time the ask began to wait, ${JSON.stringify(nextRound.waits.since)}, cannot be read, so nobody can say how long it has waited. ${rows}`
      : `The ask waited ${Math.floor((Date.now() - since) / 60_000)} minutes, from ${nextRound.waits.since}, for the run before it to end. The office lets it wait at most ${limit} minutes. ${rows}`
  writeTheNextRound(record.id, { ...withoutHold, state: 'failed', failed: { at: nowStamp(), says } } as unknown as Record<string, unknown>, theOfficeWritesIt())
  theAreaOfAnAskThatDidNotStartGoes(record, nextRound)
  tellTheAsker(record, nextRound, says)
  if (nextRound.repair !== undefined) retryTheRepairRound(nextRound.repair.entry, record.id, record.workspaceId, says, repairDue(nextRound))
  return true
}

/** The runtime that uses the Claude login: the cap counts runs on it, whatever model they name. */
const THE_RUNTIME_ON_THE_CLAUDE_LOGIN: AgentRuntime = 'claude-code'

/**
 * HOW MANY CLAUDE SUPERVISOR RUNS ARE GOING, in every project (wave 13r round AX, item 24): the cap is about one Claude
 * login, and what uses it is a run on the runtime `THE_RUNTIME_ON_THE_CLAUDE_LOGIN`. A run counts while it has a process
 * row that still runs (`aProcessRowStillRuns`), serves an agent that holds the supervisor card, and names that runtime.
 * A run that reads running with no such row does not count: nothing of its program is known to run.
 */
function theClaudeSupervisorsGoing(): number {
  const projects = sqlite
    .prepare("SELECT DISTINCT workspace_id AS workspaceId FROM session_resources WHERE type = 'process' AND released_at IS NULL")
    .all() as { workspaceId: string }[]
  const going = new Set<string>()
  for (const { workspaceId } of projects) {
    for (const row of listResources({ workspaceId, type: 'process' })) {
      if (going.has(row.sessionRecordId) || !aProcessRowStillRuns(row)) continue
      const run = getRecord(row.sessionRecordId)
      if (run === null || run.kind !== 'session' || run.deletedAt) continue
      if (text(run.data['runtime']) !== THE_RUNTIME_ON_THE_CLAUDE_LOGIN) continue
      const agent = theAgentARunServes(run.data)
      if (agent === null || theCardOfAgent(agent.id) !== THE_SUPERVISOR) continue
      going.add(run.id)
    }
  }
  return going.size
}

/**
 * THE CAP, or a refusal in its own words. env.ts refuses an unreadable value with a plain Error, which the server answers
 * only as "internal error", so the worker could not say what is wrong; `maxAvatarBytes` in lib/avatars.ts refuses the same
 * way, with a 500.
 */
function theCapOfClaudeSupervisors(): number {
  try {
    return claudeSupervisorsAtOnce()
  } catch (error) {
    throw new PanelError(`${error instanceof Error ? error.message : String(error)} No next round of this project is listed until it can be read.`, 500)
  }
}

/**
 * THE RUNTIME A NEXT ROUND WOULD START ON, as the start works it out from the row its ask kept (`theRoundAtTheStart`),
 * or null when the start would fail or refuse: the start then says why in its own words, so the cap holds nothing back
 * it cannot name.
 */
function theRuntimeTheCapReads(record: PanelRecord, agent: { id: string; handle: string }, workspaceId: string): string | null {
  const nextRound = readTheNextRound(record.data[NEXT_ROUND])
  if (nextRound === null) return null
  try {
    const chosen = theRoundAtTheStart(record, nextRound, agent, workspaceId)
    return 'fails' in chosen ? null : chosen.runtime
  } catch (error) {
    if (error instanceof PanelError) return null
    throw error
  }
}

/**
 * The asks in this project that wait for the worker: wanted, the agent has no run going, and no process of the run that
 * holds the ask still runs (`itWaitsForItsRun`, which writes the wait and the failure on the ask).
 *
 * THE CAP OF CLAUDE SUPERVISORS (wave 13r round AX, item 24). A supervisor's round that would start on the runtime
 * `THE_RUNTIME_ON_THE_CLAUDE_LOGIN` is left out while the Claude supervisors going, with the rounds this list already
 * holds, reach MOLE_OFFICE_CLAUDE_SUPERVISORS_AT_ONCE. The ask stays wanted with a hold reason until capacity returns.
 */
type RoundCap = { value: { atOnce: number; going: number } | null }

/** Write a hold only when its reason changes. */
function holdTheRound(record: PanelRecord, says: string, by: NonNullable<TheNextRound['held']>['by'] = NEXT_ROUND_HELD_BY.office, cap = false): void {
  const stored = readTheNextRound(getRecord(record.id)?.data[NEXT_ROUND])
  if (stored === null) return
  const round = cap && stored.repair !== undefined
    ? { ...stored, repair: { ...stored.repair, capHeldSince: stored.repair.capHeldSince ?? Date.now() } }
    : endRepairCapHold(stored)
  if (round === stored && round.held?.says === says && round.held.by === by) return
  writeTheNextRound(record.id, { ...round, held: { since: round.held?.says === says ? round.held.since : nowStamp(), says, by } } as unknown as Record<string, unknown>, theOfficeWritesIt())
}

/** A missing registry row has the same hold whether its stored id or the resolved identity was read first. */
function holdAnUnregisteredAgent(record: PanelRecord, id: string, handle: string | null): void {
  holdTheRound(record, `Agent ${handle === null ? id : `${handle} (${id})`} is not registered.`)
}

/** A worker's reason for being unable to launch the ask. */
export function theWorkerHeldTheRound(input: { run: string; workspaceId: string; because: string }): TheNextRound {
  const { record, nextRound } = theRunHolding(input.run, input.workspaceId)
  if (nextRound.state !== 'wanted') refused(`The next round of run ${record.id} is ${nextRound.state}, so it cannot be held. Nothing was written.`, 409)
  holdTheRound(record, input.because, NEXT_ROUND_HELD_BY.worker)
  return readTheNextRound(getRecord(record.id)!.data[NEXT_ROUND])!
}

/** All served projects, sharing one cap for this list. */
export function theRoundsToStartInEveryServedProject(): (ARoundToStart & { workspaceId: string })[] {
  const cap: RoundCap = { value: null }
  return theProjectsTheWorkerServes().flatMap((workspaceId) => theRoundsToStart(workspaceId, cap).map((round) => ({ ...round, workspaceId })))
}

function requireAnActiveRoundAgent(record: PanelRecord, round: TheNextRound, handle: string, retired: boolean): void {
  if (retired) itFailed(record, round, `${handle} has been retired since the round was asked for.`, 409)
}

function requireTheRoundSource(record: PanelRecord, round: TheNextRound, agent: { id: string; handle: string }, workspaceId: string): { folder: string; brief: TheNextRound['brief'] } {
  const newest = theLastSandboxRunOf(agent.id, agent.handle, workspaceId)
  if (newest?.id !== record.id) itFailed(record, round, `Run ${record.id} is no longer the last of ${agent.handle} started in a sandbox: run ${newest?.id ?? 'unknown'} is.`, 409)
  const folder = theSandboxFolderOf(record.data)
  if (folder !== round.sandbox.folder) itFailed(record, round, `The office can no longer vouch for sandbox ${round.sandbox.folder}.`, 409)
  let brief: TheNextRound['brief']
  try { brief = theBriefAt(round.brief.path, folder) }
  catch (error) { return itFailed(record, round, error instanceof Error ? error.message.replace(/ Nothing was written\.$/, '') : String(error), 409) }
  if (brief.sha256 !== round.brief.sha256) itFailed(record, round, `The brief ${brief.path} changed after it was asked for.`, 409)
  return { folder, brief }
}

export function theRoundsToStart(workspaceId: string, cap: RoundCap = { value: null }): ARoundToStart[] {
  const rows = sqlite
    .prepare(
      // THE WHERE OF `records_session_wants_a_next_round_idx` (migration 0296, wave 13y round 74), so SQLite reads that index.
      "SELECT id FROM records WHERE kind = 'session' AND workspace_id = ? AND deleted_at IS NULL " +
        `AND ${theWordsOfAStoredField(STORED_FIELDS.sessionWantsANextRound, 'data')} ` +
        "AND json_extract(data, '$.nextRound.state') = 'wanted' ORDER BY updated_at ASC, id ASC LIMIT 25",
    )
    .all(workspaceId) as { id: string }[]
  const rounds: ARoundToStart[] = []
  // READ ONLY WHEN A ROUND ON THE CLAUDE LOGIN IS FOUND, so an unreadable cap is refused in words where it is needed.
  for (const row of rows) {
    const run = getRecord(row.id)
    const agent = run === null ? null : theAgentARunServes(run.data)
    if (run === null) continue
    if (agent === null) {
      const namedId = text(run.data['servingAgentId'])
      if (namedId !== null && readParticipant({ kind: 'agent', id: namedId }) === null) {
        const handle = text(run.data['servingAgent'])
        holdAnUnregisteredAgent(run, namedId, handle)
      } else holdTheRound(run, `Run ${run.id} does not name an agent the office can read.`)
      continue
    }
    const serving = runServing(agent.id, workspaceId)
    if (serving !== null) { holdTheRound(run, `Run ${serving} is still serving ${agent.handle}.`); continue }
    if (itWaitsForLanding(run)) {
      const round = readTheNextRound(getRecord(run.id)?.data[NEXT_ROUND])
      if (round?.state === 'wanted') holdTheRound(run, `The repair for merge entry ${round.repair!.entry} waits for its landing on main.`)
      continue
    }
    const beforeRunWait = readTheNextRound(getRecord(run.id)?.data[NEXT_ROUND])
    if (beforeRunWait?.repair?.capHeldSince !== undefined && theProcessesStillRunning(run.id, workspaceId).length > 0) {
      writeTheNextRound(run.id, endRepairCapHold(beforeRunWait) as unknown as Record<string, unknown>, theOfficeWritesIt())
    }
    if (itWaitsForItsRun(getRecord(run.id)!, workspaceId)) continue
    const registered = readParticipant({ kind: 'agent', id: agent.id })
    if (registered === null) { holdAnUnregisteredAgent(run, agent.id, agent.handle); continue }
    const waiting = aWaitingStarterChangeSays(agent.id); if (waiting !== null) { holdTheRound(run, waiting); continue }
    if (!('startedBy' in registered) || registered.startedBy === null) { holdTheRound(run, `Agent ${agent.handle} (${agent.id}) has no registered starter.`); continue }
    if (theCardOfAgent(agent.id) === THE_SUPERVISOR) {
      if (theRuntimeTheCapReads(run, { id: agent.id, handle: registered.handle }, workspaceId) === THE_RUNTIME_ON_THE_CLAUDE_LOGIN) {
        cap.value ??= { atOnce: theCapOfClaudeSupervisors(), going: theClaudeSupervisorsGoing() }
        if (cap.value.going >= cap.value.atOnce) {
          const repair = readTheNextRound(getRecord(run.id)?.data[NEXT_ROUND])
          if (repair?.repair !== undefined) {
            try {
              requireAnActiveRoundAgent(run, repair, agent.handle, registered.retired === true)
              requireTheRoundSource(run, repair, agent, workspaceId)
              repairCut(run, repair)
            } catch (error) {
              if (!(error instanceof PanelError)) throw error
              continue
            }
          }
          holdTheRound(run, theClaudeSupervisorCapSays(cap.value.atOnce, cap.value.going), NEXT_ROUND_HELD_BY.office, true)
          continue
        }
        cap.value.going += 1
      }
    }
    const stored = readTheNextRound(getRecord(run.id)?.data[NEXT_ROUND])
    const nextRound = stored === null ? null : endRepairCapHold(stored)
    if (nextRound?.held?.by === NEXT_ROUND_HELD_BY.office) {
      const { held: _held, ...withoutHold } = nextRound
      writeTheNextRound(run.id, withoutHold as unknown as Record<string, unknown>, theOfficeWritesIt())
    }
    rounds.push({ run: run.id, agentId: agent.id, handle: registered.handle, runtime: text(run.data['runtime']) })
  }
  return rounds
}

export interface TheRoundStarts {
  run: string
  handle: string
  runtime: string
  model: string
  modelSays: string
  /** A native row's selection as the office answers it for this start, given to the launcher with --selection; null for a row with none and for no row. */
  selection: CastingSelection | null
  instance: string
  sandboxes: string
  brief: string
  workspaceId: string
  worktree?: string
  cutFrom?: string
  tip?: string
}

/** The same reserved directory rule for a repair and for a round after a git seal. */
function theRoundsNewDirectory(folder: string, handle: string, wrapper: string): string {
  return join(folder, 'worktrees', `${handle}-${wrapper}`)
}

/** The run that holds an ask, or a refusal. */
function theRunHolding(run: string, workspaceId: string): { record: PanelRecord; nextRound: TheNextRound } {
  const record = getRecord(run)
  if (record === null || record.kind !== 'session' || record.workspaceId !== workspaceId) {
    refused(`There is no run ${run} in this project. Nothing was written.`, 404)
  }
  const nextRound = readTheNextRound(record.data[NEXT_ROUND])
  if (nextRound === null) refused(`Run ${run} holds no ask for a next round. Nothing was written.`, 409)
  return { record, nextRound }
}

/** Write `failed` on the run, tell the asker in one line, and refuse with the same words. */
function itFailed(record: PanelRecord, nextRound: TheNextRound, says: string, status: number): never {
  writeTheNextRound(record.id, { ...nextRound, state: 'failed', failed: { at: nowStamp(), says } } as unknown as Record<string, unknown>, theOfficeWritesIt())
  theAreaOfAnAskThatDidNotStartGoes(record, nextRound)
  tellTheAsker(record, nextRound, says)
  if (nextRound.repair !== undefined) retryTheRepairRound(nextRound.repair.entry, record.id, record.workspaceId, says, repairDue(nextRound))
  refused(`${says} The ask is now failed. Nothing was started.`, status)
}

/** The work area the ask set from its brief's declaration is emptied, as for any start that failed. */
function theAreaOfAnAskThatDidNotStartGoes(record: PanelRecord, nextRound: TheNextRound): void {
  const agent = theAgentARunServes(record.data)
  if (agent !== null) aFailedStartEmptiesTheAreaOfItsAsk(agent.id, record.workspaceId, { door: 'next-round', askedOn: record.id, askedAt: nextRound.askedAt }, theOfficeWritesIt())
}

/**
 * One line to whoever asked, saying the round did not start. Nothing is said when the asker cannot be read, or when the
 * office asked: the merge queue reads the failed ask itself and records it on the entry.
 */
function tellTheAsker(record: PanelRecord, nextRound: TheNextRound, says: string): void {
  if (nextRound.askedBy.as === 'the office') return
  const to: ParticipantRef = nextRound.askedBy.who
  if (readParticipant(to) === null) return
  writeASystemLineToOne(to, record.workspaceId, SYSTEM_LINES.aNextRoundDidNotStart(`The next round after run ${record.id} did not start. ${says}`), THE_OFFICE, { run: record.id })
}

/**
 * THE EFFORT THE LAUNCHER IS ANSWERED, worked out where the launcher works it out (the inspector's refusal cI6RX4Ur8IiO,
 * invariant 9). Before it starts a run, the launcher asks GET /api/office/run-models/for/<agent>?place=builder with the
 * runtime and the model it was given, through aCommandsStartFromTheOffice in tools/sandbox-common.mjs, and passes the
 * effort it is answered where the program can take one. This asks the same question of the reader behind that door. When the office cannot answer the
 * launcher (no reply, its 503 stand-in, 401 or 403), the launcher uses the owner's rule and says so in its start
 * values. Any effort it passes is written on the run it starts, as `effort`. Both doors that start a run through the
 * launcher record this, the next round's and the worker run's.
 */
export function theEffortTheLauncherIsAnswered(asked: { agentId: string; handle: string; runtime: string; model: string; project: string }): TheEffortTheLauncherIsAnswered {
  // A START: a held Casting row is refused here with a 409, before either door that asks this has written anything.
  const answered = theModelARunStartsWith({ place: 'builder', agentId: asked.agentId, runtime: asked.runtime, model: asked.model, project: asked.project })
  if (answered.effort === undefined || answered.effortFrom === undefined) {
    throw new Error(`The office's answer for a builder run of ${asked.handle} names no effort or no source of it, so the effort the launcher passes cannot be recorded.`)
  }
  return {
    effort: answered.effort,
    effortFrom: answered.effortFrom,
    effortSays:
      `The launcher asks the office for a builder run of ${asked.handle} on ${asked.runtime} with model ${asked.model}, and the office answers: ${answered.says} ` +
      "If the office cannot answer the launcher, the launcher uses the owner's rule and says so. Any effort the launcher passes is written on the run it starts.",
  }
}

/** Why a next round that is no longer wanted is not started, in words, so the stored state is not put in a sentence. */
const NO_LONGER_WANTED: Record<Exclude<NextRoundState, 'wanted'>, string> = {
  starting: 'is being started already',
  started: 'has started already',
  failed: 'failed',
}

/** Why a round starts on another program than the run it continues, and the program it leaves. */
type TheSwitchedProgram = { from: string; says: string }

/**
 * WHAT THE ROUND'S RULE READS: a Casting row with the card it is in force for, or no row and the model the round
 * continues. `now` is the ask, which reads the row in force; `at the ask` is the start, which reads what the ask kept.
 * `switched` is set only when the run's own program is spent, so the row is another program's and the round starts a
 * new conversation there.
 */
type TheRowARoundReads =
  | { row: Pick<CastingRow, 'id' | 'cells' | 'native' | 'hold' | 'selectionRevision'>; card: string; when: 'now' | 'at the ask'; switched?: TheSwitchedProgram }
  | { row: null; card: string | null; model: string | null; when: 'now' | 'at the ask' }

/**
 * WHAT THE OFFICE KNOWS LIMITS A RUNTIME AND A MODEL NOW, in the limit's own words, or null because it knows none.
 * A limit whose model is null covers every model on its runtime, which is how Claude's shared login is recorded.
 */
function theLimitsNow(): CastingLimits {
  const now = Date.now()
  return theModelsLimitedAt(now, { week: theSandboxesLoginForTheRouter(now) })
}

/** The limit that covers this runtime and model among the ones read now, in its own words, or null. */
function theLimitThatCovers(limits: CastingLimits, runtime: string, model: string | null): string | null {
  const same = (limited: string | null): boolean => {
    // A LIMIT WITH NO MODEL COVERS EVERY MODEL OF ITS RUNTIME. Every Claude stop and the Claude week limit are recorded
    // with model null, because every Claude model shares one login; src/shared/casting-roll.ts's theLimitsOn reads the
    // same field the same way. Reading it as "only a run whose model is unknown" hid every Claude limit.
    if (limited === null) return true
    if (model === null) return false
    if (castingModelName(limited) === castingModelName(model)) return true
    // Every OpenCode Go model is paid from one Go allowance, so one Go limit covers them all.
    return runtime === 'opencode' && limited.startsWith('opencode-go/') && model.startsWith('opencode-go/')
  }
  return limits.limited.find((one) => one.runtime === runtime && same(one.model))?.says ?? null
}

/** Why a row in force is spent: its Out until, the instant the row stores, is still to come. */
export function theRowIsOutUntil(id: number, card: string, instant: string): string {
  return `Casting row ${String(id)}, in force for ${card}, is out until ${instant}.`
}

/** The ask's refusal when the run's own program is out and no row of another program can be drawn. */
export function noOtherProgramToDraw(from: string, outSays: string, card: string): string {
  return `The run it continues ran on ${from}, and that program is out: ${outSays} No Casting row in force for ${card} casts another ` +
    'program the launcher can start with a probability above zero and no Out until still to come, so the round cannot start on another program.'
}

/** The ask's refusal when two or more rows in force cast the run's program, and not exactly one of them casts its model. */
export function noOneRowCastsTheRunsModel(rows: readonly number[], card: string, runtime: string, run: string, marked: number, markedCasts: string | null): string {
  return `Casting rows ${rows.map((one) => String(one)).join(' and ')}, in force for ${card}, ` +
    `${rows.length === 2 ? 'both cast' : 'all cast'} ${runtime}, the runtime of run ${run}, and the marked row ` +
    `${String(marked)} casts ${markedCasts ?? 'no program'}, so the round cannot choose its model from one row.`
}

/** A row's Out until while it is still to come, or null: a time that has passed puts the row back with nothing written. */
function theOutUntilStillToCome(row: Pick<CastingRow, 'id' | 'cells'>, now: number): string | null {
  const out = readCastingOutUntil(row.cells.out_until.value, `Casting row ${String(row.id)}`)
  return out !== null && out > now ? row.cells.out_until.value : null
}

/**
 * WHY THE RUN'S OWN PROGRAM IS SPENT, in words, or null because it is not: its row in force is out until a time still to
 * come, or the provider reports a limit that covers the runtime and model. The row is the one the door would otherwise
 * take. A probability of 0 does not make it spent: 0 only means the row is not drawn, so a round continues on its own row.
 */
function whyTheProgramIsOut(limits: CastingLimits, row: Pick<CastingRow, 'id' | 'cells'>, runtime: string, run: PanelRecord, card: string): string | null {
  const out = theOutUntilStillToCome(row, Date.now())
  if (out !== null) return theRowIsOutUntil(row.id, card, out)
  return theLimitThatCovers(limits, runtime, row.cells.model.value ?? text(run.data['model']))
}

/**
 * THE LINE'S DRAWN ROW OF ANOTHER PROGRAM, when the run's own program is spent: the rows in force for the card that cast
 * another program the launcher can start, weighted by their probabilities, with a row at no probability, out until a time
 * still to come or under a limit left out. It says why nothing could be drawn, so the ask is refused rather than starting a round that would fail at once.
 */
function theDrawnRowOfAnotherProgram(limits: CastingLimits, card: string, workspaceId: string, from: string, outSays: string): TheRowARoundReads | { fails: string } {
  const draws: { row: CastingRow; probability: number }[] = []
  const now = Date.now()
  for (const one of theRowsInForce(card, workspaceId)) {
    const program = one.cells.program.value
    const model = one.cells.model.value
    if (program === null || program === from || model === null) continue
    if (!Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, program)) continue
    const probability = readCastingProbability(one.cells.probability.value)
    if (probability === null || probability <= 0) continue
    if (theOutUntilStillToCome(one, now) !== null) continue
    if (theLimitThatCovers(limits, program, model) !== null) continue
    draws.push({ row: one, probability })
  }
  draws.sort((a, b) => a.row.id - b.row.id)
  if (draws.length === 0) {
    return { fails: noOtherProgramToDraw(from, outSays, card) }
  }
  const total = draws.reduce((sum, draw) => sum + draw.probability, 0)
  let number = Math.random() * total
  let drawn = draws[draws.length - 1]!.row
  for (const draw of draws) {
    number -= draw.probability
    if (number < 0) {
      drawn = draw.row
      break
    }
  }
  return { row: drawn, card, when: 'now', switched: { from, says: outSays } }
}

/**
 * THE ROW THE ASK READS: the marked row in force for the agent's card when it casts the run's program, else the one row
 * in force for the card that casts it, marked or not. Of two or more rows in force for the card that cast it, it reads the
 * one that casts the run's model; none, or more than one, fails the ask, because the round cannot choose between them.
 * With no row at all it reads none, with the model of the run it continues.
 * When the run's own program is spent, the ask draws the line's row of another program, and the round starts a new
 * conversation there (the case first: a Codex line whose Terra row is out gets a Claude row).
 */
function theRowTheAskReads(run: PanelRecord, agentId: string, workspaceId: string): TheRowARoundReads | { fails: string } {
  const { card, row } = theCastingRowABuilderReads(agentId, workspaceId)
  if (card === null || row === null) return { row: null, card, model: text(run.data['model']), when: 'now' }
  const runtime = text(run.data['runtime'])
  if (runtime === null) return { row, card, when: 'now' }
  const limits = theLimitsNow()
  if (row.cells.program.value === runtime) {
    const out = whyTheProgramIsOut(limits, row, runtime, run, card)
    return out === null ? { row, card, when: 'now' } : theDrawnRowOfAnotherProgram(limits, card, workspaceId, runtime, out)
  }
  const forItsProgram = theRowsInForce(card, workspaceId).filter((one) => one.cells.program.value === runtime)
  // OF TWO OR MORE, THE ONE THAT CASTS THE RUN'S MODEL, by castingModelName and nothing wider: one Go limit covers
  // every opencode-go model, but that rule is about limits and picks no row. A row's probability
  // is not read: a row at 0 is only not drawn.
  const model = text(run.data['model'])
  const forItsModel = forItsProgram.length > 1
    ? forItsProgram.filter((one) => model !== null && one.cells.model.value !== null && castingModelName(one.cells.model.value) === castingModelName(model))
    : forItsProgram
  if (forItsProgram.length > 1 && forItsModel.length !== 1) {
    return { fails: noOneRowCastsTheRunsModel(forItsProgram.map((one) => one.id), card, runtime, run.id, row.id, row.cells.program.value) }
  }
  const itsRow = forItsModel[0]
  if (itsRow !== undefined) {
    const out = whyTheProgramIsOut(limits, itsRow, runtime, run, card)
    return out === null ? { row: itsRow, card, when: 'now' } : theDrawnRowOfAnotherProgram(limits, card, workspaceId, runtime, out)
  }
  // No row in force casts the run's program: the provider can still report its limit, and then the round moves.
  const limited = theLimitThatCovers(limits, runtime, text(run.data['model']))
  if (limited !== null) return theDrawnRowOfAnotherProgram(limits, card, workspaceId, runtime, limited)
  return { row, card, when: 'now' }
}

/**
 * THE MODEL A NEXT ROUND STARTS ON, worked out in one place for the ask, the start and the cap of Claude supervisors:
 * the run's runtime, which the launcher must be able to continue, the model it starts, the effort the launcher is
 * answered for it, the row it starts on as the ask keeps it, and a native row's selection. Why not, in words, when
 * there is none. The ask reads the row in force now; the start and the cap read the row the ask kept
 * (`theRoundAtTheStart`), so the two doors cannot name different rows or models.
 */
function theModelARoundStartsOn(
  record: PanelRecord,
  agent: { id: string; handle: string },
  workspaceId: string,
  read: TheRowARoundReads | { fails: string },
):
  | { runtime: string; model: string; modelSays: string; effort: TheEffortTheLauncherIsAnswered; row: TheRowAWorkerIsGiven | null; selection: CastingSelection | null; switched?: TheSwitchedProgram }
  | { fails: string } {
  if ('fails' in read) return read
  // THE PROGRAM IS THE RUN'S OWN, unless the ask drew another because the run's own program is spent. Then the launcher
  // starts a new conversation on the drawn program, from the brief, in the round's new directory.
  const switched = read.row === null ? undefined : read.switched
  const runtime = read.row !== null && switched !== undefined ? read.row.cells.program.value : text(record.data['runtime'])
  if (runtime === null) return { fails: `Run ${record.id} names no runtime, so the round cannot be started on it.` }
  if (!Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, runtime)) return { fails: `Run ${record.id} names runtime ${runtime}, which the round launcher cannot continue.` }
  // THE MODEL IS THE ROLE'S CASTING ROW IN FORCE when the round was asked for: the marked row when it casts the run's
  // program, else the one row in force for the card that casts it, marked or not, or of several the one that casts the
  // run's model, which the model reader reads for a builder of this agent, so a line changes its model in the Casting
  // table. A round
  // continues its run on the run's runtime, so a marked row that casts another runtime fails when no row in force for
  // the card casts it. The one exception is a spent program, whose ask draws another program's row (`switched`). With no
  // row at all the round keeps data.model, the model the previous run requested, as the ask read it; data.served observes
  // what answered and is not a setting.
  // THE START READS WHAT THE ASK KEPT, and says so.
  const atTheStart = read.when === 'at the ask'
  let model: string
  let modelSays: string
  let whose: string
  let row: TheRowAWorkerIsGiven | null = null
  if (read.row === null) {
    whose = atTheStart ? `The ask after run ${record.id}` : `Run ${record.id}`
    if (read.model === null) return { fails: `${whose} names no model, so the round cannot continue its model.` }
    model = read.model
    modelSays = atTheStart
      ? `No Casting row was in force for ${agent.handle} in ${workspaceId} when the round was asked for, so the round keeps model ${model} from run ${record.id}.`
      : inEnglish(saying('roundKeepsThePreviousModel', { card: read.card ?? `the role of ${agent.handle}`, project: workspaceId, model, run: record.id }))
  } else {
    const held = theHoldOn(read.row)
    if (held !== null) return { fails: held }
    const card = atTheStart ? `${read.card} when the round was asked for` : read.card
    const program = read.row.cells.program.value
    const cast = read.row.cells.model.value
    if (program !== runtime || cast === null) {
      return { fails: inEnglish(saying('roundRowCastsAnotherRuntime', { row: read.row.id, card, program: program ?? 'no program', model: cast ?? 'no model', run: record.id, runtime })) }
    }
    row = theRowAsTheAskReadIt(read.row)
    model = theStartOfTheRow(row, { runtime, model: cast }).model
    whose = `Casting row ${String(row.id)}`
    modelSays = `Casting row ${String(row.id)}, in force for ${card}, names ${cast} for ${runtime}, so the round starts ${model}.`
    if (switched !== undefined) {
      modelSays =
        `${modelSays} The run it continues ran on ${switched.from}, and that program is out: ${switched.says} ` +
        `The round starts on ${runtime} in a new conversation from the brief.`
    }
  }
  // A RUNTIME WITH A PROVIDER IN THE DATA FILE takes a model under that provider, or a bare model only when that name is
  // already the name the launcher is given for it: a bare Codex model is given its provider by the one naming rule
  // (src/shared/worker-runs.ts), and a bare Claude Code model is Claude's own. A runtime with no provider there, as dsh
  // and opencode, takes any model of the allowed shape, as the launcher passes it. A native row's Office model is only
  // its label, because the launcher starts the row's selection, so no provider is read from it.
  const provider = row === null || row.revision === null ? THE_PROVIDER_A_RUNTIME_RUNS[runtime] ?? null : null
  const underItsProvider = provider !== null && model.startsWith(`${provider}/`) && model.length > provider.length + 1 && !model.slice(provider.length + 1).includes('/')
  const itsOwnName = theModelTheLauncherIsGiven({ runtime, model }) === model
  const usable = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(model) &&
    (provider === null || underItsProvider || (!model.includes('/') && itsOwnName))
  if (!usable) {
    if (provider !== null && model.includes('/') && !model.startsWith(`${provider}/`)) {
      return { fails: `${whose} names model ${model}, which ${runtime} cannot use for continuation: ${runtime} takes a model of provider ${provider}.` }
    }
    return { fails: `${whose} names model ${model}, which ${runtime} cannot use for continuation.` }
  }
  // THE EFFORT, from the reader the launcher asks, and a native row's selection from the same reader. Its 409 (a held
  // row, a name two rows match, a refusal) fails in the reader's own words, so the asker is told and the ask is not
  // tried again on every pass.
  let effort: TheEffortTheLauncherIsAnswered
  let selection: CastingSelection | null = null
  try {
    effort = theEffortTheLauncherIsAnswered({ agentId: agent.id, handle: agent.handle, runtime, model, project: workspaceId })
    if (row !== null && row.revision !== null) {
      selection = theModelARunStartsWith({ place: 'builder', agentId: agent.id, runtime, model, project: workspaceId }).selection ?? null
    }
  } catch (error) {
    if (!(error instanceof PanelError) || error.status !== 409) throw error
    return { fails: error.message }
  }
  // A NATIVE ROW STARTS ON ITS OWN SELECTION, at the revision the ask read, or not at all.
  if (row !== null && row.revision !== null && (selection?.casting?.id !== row.id || selection.casting.revision !== row.revision)) {
    return {
      fails:
        `The office's answer for a builder run of ${agent.handle} on ${runtime} with model ${model} is not the native selection of Casting row ` +
        `${String(row.id)}, the row the round starts on. It is not swapped for another row.`,
    }
  }
  return { runtime, model, modelSays, effort, row, selection, ...(switched === undefined ? {} : { switched }) }
}

/**
 * THE ROUND AT THE START, by the rule the ask read: the row the ask kept, read again by its id, or no row and the model
 * the ask kept. A changed, held or removed row fails, and no other row is taken. Only an ask made before an ask kept its
 * row is read on the row in force now, and the start says so. The start and the cap of Claude supervisors read this.
 */
function theRoundAtTheStart(
  record: PanelRecord,
  nextRound: TheNextRound,
  agent: { id: string; handle: string },
  workspaceId: string,
): ReturnType<typeof theModelARoundStartsOn> {
  const checkLimits = (chosen: ReturnType<typeof theModelARoundStartsOn>): ReturnType<typeof theModelARoundStartsOn> => {
    if ('fails' in chosen) return chosen
    const limited = theLimitThatCovers(theLimitsNow(), chosen.runtime, chosen.model)
    return limited === null ? chosen : { fails: `The round cannot start on ${chosen.runtime} with ${chosen.model}: ${limited}` }
  }
  if (nextRound.row === null) return checkLimits(theModelARoundStartsOn(record, agent, workspaceId, { row: null, card: null, model: text(nextRound.model), when: 'at the ask' }))
  if (nextRound.row === undefined) {
    const chosen = theModelARoundStartsOn(record, agent, workspaceId, theRowTheAskReads(record, agent.id, workspaceId))
    return checkLimits('fails' in chosen ? chosen : { ...chosen, modelSays: `${chosen.modelSays} The ask was made before an ask kept its row, so the start read the row in force now.` })
  }
  const kept = theKeptRowAtTheStart(nextRound.row)
  if (!kept.ok) return { fails: kept.says }
  const out = theOutUntilStillToCome(kept.read, Date.now())
  if (out !== null) return { fails: theRowIsOutUntil(kept.read.id, kept.read.role, out) }
  const read: TheRowARoundReads = nextRound.switched === undefined
    ? { row: kept.read, card: kept.read.role, when: 'at the ask' }
    : { row: kept.read, card: kept.read.role, when: 'at the ask', switched: nextRound.switched }
  return checkLimits(theModelARoundStartsOn(record, agent, workspaceId, read))
}

/**
 * THE WORKER IS STARTING THE ROUND, with its launcher run `wrapper`. Everything the ask was checked for is checked
 * again; a failure is written as `failed` and refused. Otherwise the ask becomes `starting`, and the reply is what the
 * launcher is given.
 */
export function startingTheNextRound(input: { run: string; wrapper: string; workspaceId: string }): TheRoundStarts {
  const { record, nextRound } = theRunHolding(input.run, input.workspaceId)
  if (nextRound.state !== 'wanted') refused(`The next round of run ${record.id} ${NO_LONGER_WANTED[nextRound.state]}. Nothing was written.`, 409)
  const wrapper = getRecord(input.wrapper)
  const extra = wrapper !== null && isObject(wrapper.data['extra']) ? wrapper.data['extra'] : {}
  if (
    wrapper === null || wrapper.kind !== 'session' || wrapper.data['runtime'] !== ROUND_LAUNCHER_RUNTIME ||
    wrapper.data['startedByMoleOffice'] !== true || extra['purpose'] !== 'round' || extra['round'] !== record.id
  ) {
    refused(`Run ${input.wrapper} is not a launcher run the office started for the next round of run ${record.id}. Nothing was written.`, 409)
  }
  const served = theAgentARunServes(record.data)
  const agent = served === null ? null : readParticipant({ kind: 'agent', id: served.id })
  if (agent === null || !('startedBy' in agent)) return itFailed(record, nextRound, `Run ${record.id} serves no agent the office knows.`, 409)
  requireAnActiveRoundAgent(record, nextRound, agent.handle, agent.retired === true)
  const serving = runServing(agent.id, input.workspaceId)
  if (serving !== null) refused(`Run ${serving} is still serving ${agent.handle}. The ask waits. Nothing was written.`, 409)
  const { folder, brief } = requireTheRoundSource(record, nextRound, agent, input.workspaceId)
  const chosen = theRoundAtTheStart(record, nextRound, agent, input.workspaceId)
  if ('fails' in chosen) return itFailed(record, nextRound, chosen.fails, 409)
  const { runtime, model, modelSays, effort, selection } = chosen
  let fresh: { worktree: string; cutFrom: string; tip?: string } | undefined
  let worktreeSays: string | undefined
  if (nextRound.repair !== undefined) {
    const cutFrom = repairCut(record, nextRound)
    const worktree = theRoundsNewDirectory(nextRound.sandbox.folder, agent.handle, wrapper.id)
    if (existsSync(worktree)) return itFailed(record, nextRound, `The new repair directory ${worktree} already exists.`, 409)
    fresh = { worktree, cutFrom }
  } else {
    let seal: ReturnType<typeof readRunSeal>
    try { seal = readRunSeal(record.id) }
    catch (error) { return itFailed(record, nextRound, error instanceof Error ? error.message : String(error), 409) }
    const git = seal?.seal.git
    if (git == null) {
      worktreeSays = `Run ${record.id} has no git seal, so this round works in its directory, ${text(record.data['workingDirectory']) ?? 'which was not recorded'}.`
    } else {
      const worktree = theRoundsNewDirectory(nextRound.sandbox.folder, agent.handle, wrapper.id)
      if (existsSync(worktree)) return itFailed(record, nextRound, `The new round directory ${worktree} already exists.`, 409)
      const repo = join(folder, 'repo')
      let sameRepository = false
      try {
        const common = readGit(repo, ['rev-parse', '--git-common-dir']).toString('utf8').trim()
        sameRepository = realpathSync(resolve(repo, common)) === git.repository
      } catch { /* A repository that cannot be read cannot be vouched for. */ }
      if (!sameRepository) return itFailed(record, nextRound, "The previous run's sealed repository is not this sandbox's repository.", 409)
      if (isAnAskAtTheSeal(record, nextRound)) {
        let cutFrom: string
        try { cutFrom = theLinesCurrentMain(record, agent).main }
        catch (error) { return itFailed(record, nextRound, `The next round cannot be cut from current main: ${error instanceof Error ? error.message : String(error)}.`, 409) }
        fresh = { worktree, cutFrom }
      } else {
        const cutFrom = text(record.data['cutFrom'])
        if (cutFrom === null) return itFailed(record, nextRound, 'The previous run names no cutFrom.', 409)
        try { theBaseARunNames(record.data) }
        catch (error) { return itFailed(record, nextRound, error instanceof Error ? error.message : String(error), 409) }
        fresh = { worktree, cutFrom, tip: git.commit }
      }
    }
  }
  const { held: _held, ...withoutHold } = nextRound
  writeTheNextRound(
    record.id,
    {
      ...withoutHold,
      state: 'starting',
      starting: {
        at: nowStamp(),
        wrapper: wrapper.id,
        ...fresh,
        ...(worktreeSays === undefined ? {} : { worktreeSays }),
        model,
        modelSays,
        ...effort,
      },
    } as unknown as Record<string, unknown>,
    theOfficeWritesIt(),
  )
  return {
    run: record.id,
    handle: agent.handle,
    runtime,
    model,
    modelSays,
    selection,
    instance: nextRound.sandbox.instance,
    sandboxes: dirname(nextRound.sandbox.folder),
    brief: nextRound.brief.path,
    workspaceId: input.workspaceId,
    ...fresh,
  }
}

/**
 * THE LAUNCHER ENDED. Still `starting` means it filed no run: the ask is failed and the asker told. `started` keeps how
 * it ended and the new run's open process row, or says none was open.
 */
export function theNextRoundsLauncherEnded(input: { run: string; wrapper: string; ok: boolean; says: string; workspaceId: string }): TheNextRound {
  const { record, nextRound } = theRunHolding(input.run, input.workspaceId)
  const launcher = { at: nowStamp(), ok: input.ok, says: input.says }
  if (nextRound.state === 'starting' && nextRound.starting?.wrapper === input.wrapper) {
    return itFailed(record, { ...nextRound, launcher }, `The launcher ended before it filed a run: ${input.says}`, 409)
  }
  if (nextRound.state !== 'started' || nextRound.starting?.wrapper !== input.wrapper || nextRound.started === undefined) {
    refused(`The next round of run ${record.id} was not started by launcher run ${input.wrapper}. Nothing was written.`, 409)
  }
  const rows = listResources({ workspaceId: input.workspaceId, sessionRecordId: nextRound.started.run }).filter((row) => row.type === 'process')
  const process =
    rows.length === 0
      ? { row: null, says: `No open process row of run ${nextRound.started.run} was found when the launcher ended. The round may have ended already, or no process was registered.` }
      : { row: rows[0]!.id, says: `Process row ${rows[0]!.id} of run ${nextRound.started.run} was open when the launcher ended.` }
  const after: TheNextRound = { ...nextRound, launcher, process }
  writeTheNextRound(record.id, after as unknown as Record<string, unknown>, theOfficeWritesIt())
  // A LAUNCHER THAT FILED THE RUN AND THEN ENDED BADLY is said to the asker too: the run may never have started.
  // When its run is not running, it did not start, and the area its ask set goes as for any start that failed.
  if (!input.ok) {
    if (getRecord(nextRound.started.run)?.data['state'] !== 'running') theAreaOfAnAskThatDidNotStartGoes(record, nextRound)
    tellTheAsker(record, nextRound, `The launcher filed run ${nextRound.started.run} and then ended badly: ${input.says}`)
  }
  return after
}

// ================================================================================================== the run-key door

/**
 * THE LAST RUN WHOSE NEXT ROUND THIS NEW RUN IS, when the office's key files it, or null when it is not one. Asked by
 * `mintARunKey` in api/records.ts, inside the create's transaction. The run is one when its parent is a launcher run
 * the office started for a round, and the run that round continues is `starting` with that launcher run. A run that is
 * one but is derived from another run is refused, so the create is undone.
 */
export function theNextRoundThisRunStarts(record: PanelRecord, agentId: string): string | null {
  const parent = text(record.data['parentAttachment'])
  const wrapper = parent === null ? null : getRecord(parent)
  if (wrapper === null || wrapper.kind !== 'session' || wrapper.data['startedByMoleOffice'] !== true || wrapper.data['runtime'] !== ROUND_LAUNCHER_RUNTIME) return null
  const extra = isObject(wrapper.data['extra']) ? wrapper.data['extra'] : {}
  const lastId = extra['purpose'] === 'round' ? text(extra['round']) : null
  const last = lastId === null ? null : getRecord(lastId)
  const nextRound = last === null ? null : readTheNextRound(last.data[NEXT_ROUND])
  if (last === null || nextRound?.state !== 'starting' || nextRound.starting?.wrapper !== wrapper.id) return null
  // derived_from in its general sense: the round's run continues the run before it, as register-a-run.mjs --continues files it.
  const derived = sqlite.prepare("SELECT to_id AS toId FROM links WHERE from_id = ? AND type = 'derived_from'").all(record.id) as { toId: string }[]
  if (derived.length !== 1 || derived[0]!.toId !== last.id || theAgentARunServes(last.data)?.id !== agentId) {
    refused(
      `Run "${record.title}" was filed by launcher run ${wrapper.id}, which starts the next round of run ${last.id}, but it ` +
        `is derived from ${derived.map((one) => one.toId).join(', ') || 'no run'} or serves another agent. Nothing was written.`,
      409,
    )
  }
  if (nextRound.repair !== undefined) {
    const starting = nextRound.starting!
    const directory = text(record.data['workingDirectory'])
    const cut = text(record.data['cutFrom'])
    const valid = directory === starting.worktree && cut === starting.cutFrom && directory !== text(last.data['workingDirectory'])
    if (!valid || directory === null || cut === null) refused('The repair run does not use its new prepared directory and exact main commit. Nothing was written.', 409)
    try {
      if (readGit(directory, ['rev-parse', 'HEAD']).toString('utf8').trim() !== cut) throw new Error('the worktree HEAD differs from cutFrom')
      const main = repairCut(last, nextRound)
      readGit(directory, ['merge-base', '--is-ancestor', cut, main])
    } catch (error) {
      refused(`The repair run's worktree base cannot be proved: ${error instanceof Error ? error.message : String(error)}. Nothing was written.`, 409)
    }
  } else if (isAnAskAtTheSeal(last, nextRound)) {
    const starting = nextRound.starting!
    const directory = text(record.data['workingDirectory'])
    const cut = text(record.data['cutFrom'])
    if (directory === null || directory !== starting.worktree || directory === text(last.data['workingDirectory']) || cut === null || cut !== starting.cutFrom) {
      throw new PanelError('The round does not use its new prepared directory and exact main commit. Nothing was written.', 409)
    }
    try {
      if (readGit(directory, ['rev-parse', 'HEAD']).toString('utf8').trim() !== cut) throw new Error('the worktree HEAD differs from cutFrom')
      const agent = theAgentARunServes(last.data)!
      const { root, main } = theLinesCurrentMain(last, agent)
      readGit(root, ['merge-base', '--is-ancestor', cut, main])
    } catch (error) {
      refused(`The round's worktree base cannot be proved: ${error instanceof Error ? error.message : String(error)}. Nothing was written.`, 409)
    }
  } else if (nextRound.starting?.tip !== undefined) {
    const starting = nextRound.starting
    const directory = text(record.data['workingDirectory'])
    const cut = text(record.data['cutFrom'])
    const before = last.data['cutFromCommit']
    const after = record.data['cutFromCommit']
    const keptRecordedCut = isObject(before) && before['named'] === cut
    const recordedCutMatches = keptRecordedCut
      ? isObject(after) && before['named'] === after['named'] && before['commit'] === after['commit']
      : after === undefined || (isObject(after) && after['named'] === cut)
    if (directory === null || directory !== starting.worktree || directory === text(last.data['workingDirectory']) || cut !== starting.cutFrom || !recordedCutMatches) {
      refused('The round does not use its new prepared directory and exact cutFrom. Nothing was written.', 409)
    }
    try {
      if (readGit(directory, ['rev-parse', 'HEAD']).toString('utf8').trim() !== starting.tip) throw new Error('the worktree HEAD differs from the prepared tip')
    } catch {
      refused("The round's worktree HEAD does not match its prepared tip. Nothing was written.", 409)
    }
  }
  return last.id
}

/** The new run is filed and its key minted: the ask is `started`. Inside the create's transaction. */
export function sayTheNextRoundStarted(lastId: string, runId: string, runKeyId: string): void {
  const last = getRecord(lastId)
  const nextRound = last === null ? null : readTheNextRound(last.data[NEXT_ROUND])
  if (nextRound === null) throw new Error(`Run ${lastId} lost its next round while run ${runId} was filed.`)
  writeTheNextRound(lastId, { ...nextRound, state: 'started', started: { at: nowStamp(), run: runId, runKeyId } } as unknown as Record<string, unknown>, theOfficeWritesIt())
  if (last !== null && isAnAskAtTheSeal(last, nextRound)) {
    const agent = theAgentOfARun(last)
    if (agent !== null) tellTheSecretaryTheRoundStarted(last, agent, runId, nextRound.brief.path)
  }
  if (nextRound.repair !== undefined) theRepairRoundStarted(nextRound.repair.entry, lastId, runId)
}
