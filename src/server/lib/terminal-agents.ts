// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AGENTS IN THE OFFICE'S TERMINALS: OPENING ONE, RECORDING IT, AND OPENING IT AGAIN AFTER THE HOLDER RESTARTS.
 * Wave 13u, round 3 (design report 6NVaDzG7tyUB, blocks b-4 and b-5); the owner's review decision behind this
 * line.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT OPENING AN AGENT DOES
 * ---------------------------------------------------------------------------------------
 *
 * The person presses, and the office opens a registered agent in a terminal the holder holds: in the
 * agent's recorded start folder, with its runtime's interactive command. A recorded folder is kept as it
 * is, and one that is gone is refused. With none recorded, the office makes the agent a folder of its own
 * in its data folder, records it as the agent's start folder, and opens it there
 * (terminals/an-agents-own-folder.ts, wave 13s round 205). That empty folder is the only one ever used in
 * place of none, because an agent started in a folder it was never given works on files nobody chose.
 *
 * Each agent in a terminal is a session record: its runtime, its folder, the agent it serves, the
 * provider's conversation id where the office chose one, and in `data.extra.inATerminal` which terminal
 * and which holder (pid and start time) hold it. The office files it and writes on it, because the office
 * starts the process: a session for an agent is filed only by that agent, its starters, the person with
 * their key or the office itself (lib/records.ts), and a press made while the key window is open carries no
 * key. Who pressed is kept on the record as `openedBy`, and the request is in the office's call log.
 *
 * ---------------------------------------------------------------------------------------
 * THE KEY THIS RUN IS GIVEN, AND WHY THIS WAY
 * ---------------------------------------------------------------------------------------
 *
 * The agent must work as itself, so the kit's waiter can hold its handle (tools/kit/waiter.sh asks
 * GET /api/handles/<handle>/waiting with the agent's key). The office keeps only a key's SHA-256, so it
 * cannot hand over the agent's own key. So this run gets a RUN KEY of its own: one more live key of the
 * agent, made with `makeARunKey`, its row id written on the session record as `data.extra.runKeyId`.
 * That is the shape every run key already has (src/server/api/records.ts, mintARunKey), so the key dies
 * when the run's record ends (lib/records.ts revokes it on that transition) and the Embassy names the
 * run it belongs to. The agent's own key is not touched.
 *
 * THE PERSON'S PRESS, proved by the person's key, may cause it. That is the rule a dispatched run
 * already follows (`proofForStartingANewAgent` in lib/agents.ts): a run started on the person's press
 * gets a key whose mint is recorded as `the-persons-press`. A press the office answers as the person
 * only because the key window is open is not proved, so the agent is opened WITHOUT a key, and the
 * answer and the page say that its waiter cannot hold its handle until it has one. No unproved key is
 * made, because a run key made on an unproved press would make every key that agent mints unproved
 * (lib/provedkeys.ts, howThisAgentsOwnKeyProvesAKey).
 *
 * A SECRETARY'S OWN PRESS IS A STARTER'S PRESS. The existing proof helper reads the secretary's
 * own key through howThisAgentsOwnKeyProvesAKey, just as other starter mints do. Only when every
 * live key the secretary holds is proved does the new run get a key marked a-proved-agents-key.
 * It is never the-persons-press. An unproved starter opens without a key rather than minting an
 * unproved key. A press actually admitted under the person's grant still opens without a key.
 * The terminal and run name the secretary as who opened them on either secretary path.
 *
 * A SUPERIOR'S PRESS ON THE WAY BACK IS A STARTER'S PRESS TOO. An agent above the agent in its chain of starters may
 * bring that agent's run back (`aStarterAboveTheAgentPresses`), and the key is made on the superior's own key in the
 * same way: a-proved-agents-key when every live key it holds is proved, and no key when one is not. It is never
 * the-persons-press, and the run names the superior as who brought it back.
 *
 * THE KEY GOES ONLY INTO THE TERMINAL'S ENVIRONMENT, through the holder, which keeps nothing on disk.
 * It is never written to a file, a log or a reply.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN THE RUN ENDS
 * ---------------------------------------------------------------------------------------
 *
 * The server watches each agent's terminal. When the agent's program ends, or the person closes the
 * terminal, the record ends (`finished` for exit code 0, `crashed` for any other end or the person's close;
 * `endTheRunOf` says why), and so its key is revoked. A server that restarts watches them again: a terminal the holder no longer holds, or one
 * that ended while nobody watched, ends its record then.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN THE HOLDER RESTARTS
 * ---------------------------------------------------------------------------------------
 *
 * A holder that stops ends its terminals. When the server reaches a holder it has not recorded (a new
 * pid or start time; `theHolder` in lib/terminals.ts, and at the server's start), it opens each running
 * agent whose record names another holder again, with its runtime's RESUME command, patches the record
 * (the new terminal, the new holder, a new run key in place of the old one) and tells the person in ONE
 * message from Mole Office who came back, who did not, and why. A record that cannot be opened again (its
 * folder is gone, its runtime is unknown, its agent is retired, its program is missing, or no
 * conversation id was recorded for a runtime that needs one) is named in that message and its record
 * is closed with that cause. Nothing is guessed. A record that names the current holder is never opened
 * again.
 *
 * When a watched terminal's connection drops, the holder may be restarting, so the server asks for the
 * holder every two seconds for a minute. A holder that comes back later is noticed by the next terminal
 * door anybody uses, or by the server's next start.
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { rmdirSync, statSync } from 'node:fs'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { KEY_MINT_WORDS_RENAMED, nowSaid } from '@shared/renamed-words.ts'
import type { AWayBack, TerminalParty, TerminalReading } from '@shared/terminals.ts'
import { nowStamp } from '@shared/time.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { anOpenCodeConfigWithTheFeaturesOff, CLAUDE_CODE_FEATURES_OFF, CODEX_FEATURES_OFF } from '../../config/harness-features-off.mjs'
import { THE_PROGRAM_FOR_RUNTIME, whereIsThisTool } from '../../config/runtimes.mjs'
import { THE_FIRST_SIZE } from '../../config/the-terminal-holder.mjs'
import { claudeConversationIn, codexThreadIn, namesTheCodexProgram, theRecordedProcess } from '../../config/session-process.mjs'
import { theRecordedProcessOf } from '../../config/own-rows.mjs'
import { theProcessReader } from '../../config/process-reader.mjs'
import { theWayBackOf } from '../../config/the-way-back.mjs'
import { sqlite } from '../db/client.ts'
import { addressText, theAddressThisProcessAnswersOn } from './bound-address.ts'
import { writeASystemLineToOne } from './groups.ts'
import { makeARunKey } from './keys.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { aKeyMadeThisWayIsProved, howThisPressProvesTheKeyItMakes, type HowAKeysMintWasProved } from './provedkeys.ts'
import {
  changeStartFolder,
  theStartFolderOf,
} from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { theChainUpWith } from '@shared/the-chain-up-with.ts'
import { theRowAnArrivingReferenceNames } from './the-row-an-arriving-reference-names.ts'
import { theStarterEachStringNames } from './the-starter-each-string-names.ts'
import { runtimeOfTheAgentRecord } from '../db/read-participant.ts'
import { createRecord, getRecord, patchRecord, recordInWorkspace, recordTheOriginalRunKeyMint, replaceTheRunKeyOfAReopenedRun, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { theNewestRunTheResumeLineShows, theRunTheResumeLineCounts } from './session-origins.ts'
import { isOneOf, theFiledAliasesReadOnce } from './registry-aliases/runs.ts'
import { theReceiptAtATerminalsEnd } from './terminal-run-receipt.ts'
import { aTerminalRefusal, askTheHolderFor, theEnvironmentATerminalGets, theHolder, watchATerminal, type HolderHello } from './terminals.ts'
import { named } from './named-timers.ts'
import { trustTheRecordedClaudeFolder } from './terminals/claude-folder-trust.ts'
import { makeTheAgentsOwnFolder } from './terminals/an-agents-own-folder.ts'
import { theAgentRecordsNamingTheStartFolder } from './terminals/agent-records-naming-a-start-folder.ts'

/** Mole Office itself, as the office's own writes on a run's record and its line to the person are signed. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/** The four runtimes the office opens in a terminal: the ones with a program in THE_PROGRAM_FOR_RUNTIME. */
type OpenedRuntime = keyof typeof THE_PROGRAM_FOR_RUNTIME

function isOpenedRuntime(runtime: string): runtime is OpenedRuntime {
  return Object.hasOwn(THE_PROGRAM_FOR_RUNTIME, runtime)
}

/** Where the office logs what nobody waits on: the server's log once the server's start hands it in. */
let log: { info: (line: string) => void; warn: (line: string) => void } = {
  info: () => undefined,
  warn: (line) => console.error(line),
}

/** Hand in the server's log. Called by `recordTheHolderAtStart`. */
export function logTheAgentsInTerminalsTo(to: { info: (line: string) => void; warn: (line: string) => void }): void {
  log = to
}

// ---------------------------------------------------------------------------------------
// THE COMMANDS
// ---------------------------------------------------------------------------------------

/** The arguments a runtime's program is started with, and what they promise. */
interface ACommand {
  args: string[]
  /** The provider's conversation id the office chose, or null where the runtime picks it. */
  providerSession: string | null
  /** True when the command names the conversation exactly; false when it picks the folder's last one. */
  exact: boolean
}

/**
 * THE INTERACTIVE COMMAND THAT OPENS A NEW CONVERSATION.
 *
 * claude-code  `claude --session-id <a uuid>`, so it can be resumed exactly. Read from `claude --help`, 2.1.281.
 * codex        `codex`. Codex picks its own conversation id. Read from `codex --help`, 0.159.2.
 * opencode     `opencode`. OpenCode picks its own id. Read from `opencode --help`, 1.18.31.
 * kimi         `kimi -S <an id>`. Kimi is not installed where this was written; `-S` both starts and continues a
 *              conversation by its id, as src/worker/runtimes/kimi.ts measured on 5 September 2026.
 */
function theOpeningCommand(runtime: OpenedRuntime): ACommand {
  if (runtime === 'claude-code') {
    const id = randomUUID()
    return { args: ['--session-id', id], providerSession: id, exact: true }
  }
  if (runtime === 'kimi') {
    // THE ID BECOMES A FOLDER NAME AND AN ARGUMENT, so it holds only letters, digits and dashes, and starts with a
    // letter, as src/worker/runtimes/kimi.ts requires.
    const id = `mole-office-terminal-${randomBytes(6).toString('hex')}`
    return { args: ['-S', id], providerSession: id, exact: true }
  }
  return { args: [], providerSession: null, exact: false }
}

/**
 * THE RESUME COMMAND: the conversation `providerSession` names, or the folder's last one where the runtime picks.
 *
 * claude-code  `claude --resume <id>`: exact.
 * kimi         `kimi -S <id>`: exact.
 * codex        `codex resume --last`: the most recent Codex conversation recorded for the folder it runs in. Not exact.
 * opencode     `opencode --continue`: OpenCode's last session. Not exact.
 *
 * Answers why not, where a runtime that needs an id has none recorded: such a command would start a new
 * conversation under that name and look like one that carried on.
 */
function theResumeCommand(runtime: OpenedRuntime, providerSession: string | null): ACommand | { cannot: string } {
  if (runtime === 'claude-code' || runtime === 'kimi') {
    if (providerSession === null) {
      return { cannot: `no ${runtime} conversation id was recorded for it, so there is no conversation to continue` }
    }
    return { args: [runtime === 'claude-code' ? '--resume' : '-S', providerSession], providerSession, exact: true }
  }
  if (runtime === 'codex') return { args: ['resume', '--last'], providerSession: null, exact: false }
  return { args: ['--continue'], providerSession: null, exact: false }
}

/**
 * EVERY LAUNCH WITH THE HARNESS'S OWN SUBAGENTS OFF: a new conversation, a resume, the way back and a reopening after
 * the holder restarts. An agent in the office's terminal splits its work by registered office workers, which the
 * office can see, and never by the harness's own subagents, which it cannot. The switches are the one list in
 * src/config/harness-features-off.mjs, where each was read from its version.
 *
 * claude-code  `--disallowedTools=<the list>`, before the conversation's own arguments.
 * codex        `--disable <feature>` for each, before the subcommand, so before `resume` as well.
 * opencode     its task tool denied in OPENCODE_CONFIG_CONTENT, merged into what the environment already holds. The
 *              terminal's environment carries no such variable from this server's, so it is the office's alone; one
 *              that is not a JSON object throws, and nothing is opened.
 * kimi         unchanged. Kimi is not installed where this was written, and nobody has read whether it has such a tool.
 */
function withTheHarnessFeaturesOff(runtime: OpenedRuntime, args: readonly string[], env: Record<string, string>): { args: string[]; env: Record<string, string> } {
  if (runtime === 'claude-code') return { args: [...CLAUDE_CODE_FEATURES_OFF, ...args], env }
  if (runtime === 'codex') return { args: [...CODEX_FEATURES_OFF, ...args], env }
  if (runtime === 'opencode') {
    return { args: [...args], env: { ...env, OPENCODE_CONFIG_CONTENT: anOpenCodeConfigWithTheFeaturesOff(env['OPENCODE_CONFIG_CONTENT']) } }
  }
  return { args: [...args], env }
}

/** What a resume command promises, in words. */
function whatTheResumeReaches(command: ACommand): string {
  return command.exact ? 'the same conversation' : "the folder's most recent conversation, which may not be the one it had"
}

/** Whether a path is a folder that is there now. */
function aFolderIsThere(folder: string): boolean {
  try {
    return statSync(folder).isDirectory()
  } catch {
    return false
  }
}

/** Every Claude opening, including a continuation, must use the agent's current recorded folder. */
function trustBeforeOpening(runtime: OpenedRuntime, folder: string, agentId: string, workspaceId: string, env: Record<string, string>): string {
  if (runtime !== 'claude-code') return folder
  try {
    return trustTheRecordedClaudeFolder({ folder, recordedFolder: () => theStartFolderOf(agentId, workspaceId), env })
  } catch (error) {
    const because = error instanceof Error ? error.message : 'the trust settings could not be safely written'
    throw aTerminalRefusal('terminalAgentTrustUnsafe', `Claude Code trust could not be safely recorded: ${because}. Nothing was opened.`, 409)
  }
}

/** The office's own address, as an agent in a terminal is told it. */
function theOfficesAddress(): string {
  const bound = theAddressThisProcessAnswersOn()
  if (bound === null) throw new PanelError('This server answers on no address, so an agent in a terminal could not reach it. Nothing was opened.', 500)
  return addressText(bound)
}

// ---------------------------------------------------------------------------------------
// WHAT A RECORD SAYS
// ---------------------------------------------------------------------------------------

/** Which terminal and which holder hold an agent's run: `data.extra.inATerminal` on its session record. */
interface InATerminal {
  terminal: string
  holder: { pid: number; startedAt: string | null }
  /** False once the person turned off keeping what they type in it; carried to the terminal opened again. */
  keeping?: boolean
  /** The resume command each reopening used, oldest first. */
  reopened?: { at: string; terminal: string; holder: { pid: number; startedAt: string | null }; command: string }[]
}

function extraOf(data: Record<string, unknown>): Record<string, unknown> {
  const extra = data['extra']
  return typeof extra === 'object' && extra !== null && !Array.isArray(extra) ? (extra as Record<string, unknown>) : {}
}

function inATerminalOf(data: Record<string, unknown>): InATerminal | null {
  const held = extraOf(data)['inATerminal'] as InATerminal | undefined
  return held !== undefined && typeof held.terminal === 'string' && typeof held.holder?.pid === 'number' ? held : null
}

/** The office terminal a run works in, from its session record's data, or null when it works in none. */
export function theOfficeTerminalOfTheRun(data: Record<string, unknown>, holder?: HolderHello): string | null {
  const held = inATerminalOf(data)
  return held !== null && (holder === undefined || theSameHolder(held.holder, holder)) ? held.terminal : null
}

function said(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function theSameHolder(held: InATerminal['holder'], hello: HolderHello): boolean {
  return held.pid === hello.pid && (held.startedAt ?? null) === hello.startedAt
}

/** Every session record of an agent in a terminal that has not ended, in any project. */
function theRunningAgentsInTerminals(): string[] {
  return (
    sqlite
      .prepare(
        "SELECT id FROM records WHERE kind = 'session' AND deleted_at IS NULL AND json_valid(data) " +
          "AND json_extract(data, '$.extra.inATerminal.terminal') IS NOT NULL ORDER BY created_at",
      )
      .all() as { id: string }[]
  )
    .map((row) => row.id)
    .filter((id) => !theRunHasEnded(getRecord(id)?.data['state']))
}

/**
 * REMEMBER ON THE AGENT'S RUN WHETHER ITS TERMINAL KEEPS WHAT THE PERSON TYPES, so the terminal opened again after the
 * holder restarts keeps it as the person left it. Nothing is written for a terminal no running agent is in.
 */
export function rememberTheKeepingOfTheAgentIn(terminal: string, on: boolean): boolean {
  let nothingWritten = true
  for (const session of theRunningAgentsInTerminals()) {
    const data = getRecord(session)!.data
    const held = inATerminalOf(data)
    if (held === null || held.terminal !== terminal) continue
    const { keeping: _was, ...rest } = held
    const written = patchRecord(session, { dataPatch: { extra: { ...extraOf(data), inATerminal: on ? rest : { ...rest, keeping: false } } } }, theOffice())
    if (written.nothingWritten === undefined) nothingWritten = false
  }
  return nothingWritten
}

/**
 * THE PROVIDER'S ID OF THIS AGENT'S LATEST CONVERSATION IN THIS FOLDER ON THIS RUNTIME, from its session records, or
 * null because none recorded one. Read for a press that asks to continue rather than start anew. A run stored under an
 * alias filed for the agent is the agent's run.
 */
export function theLastConversationOf(agentId: string, folder: string, runtime: string): string | null {
  const ids = theFiledAliasesReadOnce(sqlite).everyIdOf(agentId)
  const row = sqlite
    .prepare(
      "SELECT json_extract(data, '$.providerSession') AS conversation FROM records WHERE kind = 'session' AND deleted_at IS NULL " +
        `AND json_valid(data) AND json_extract(data, '$.servingAgentId') ${isOneOf(ids)} ` +
        "AND json_extract(data, '$.workingDirectory') = ? " +
        "AND json_extract(data, '$.runtime') = ? AND json_extract(data, '$.providerSession') IS NOT NULL " +
        'ORDER BY created_at DESC LIMIT 1',
    )
    .get(...ids, folder, runtime) as { conversation: unknown } | undefined
  return said(row?.conversation)
}

// ---------------------------------------------------------------------------------------
// OPENING
// ---------------------------------------------------------------------------------------

/** What the open door answers. Never the key. */
export interface AnAgentOpened {
  terminal: TerminalReading
  session: string
  agent: { id: string; handle: string }
  runtime: OpenedRuntime
  folder: string
  providerSession: string | null
  /** Whether this run was given a run key of its own, and the sentence saying what that means. */
  key: { given: boolean; says: string }
  says: string
}

/** The terminal's environment: what any terminal gets, and who this agent is and where its office is. */
function theAgentsEnvironment(base: Record<string, string>, facts: { workspaceId: string; handle: string; session: string; key: string | null }): Record<string, string> {
  return {
    ...base,
    MOLE_OFFICE_API: theOfficesAddress(),
    MOLE_OFFICE_WORKSPACE: facts.workspaceId,
    MOLE_OFFICE_AGENT: facts.handle,
    MOLE_OFFICE_SESSION: facts.session,
    ...(facts.key === null ? {} : { MOLE_AGENT_KEY: facts.key }),
  }
}

/**
 * OPEN A REGISTERED AGENT IN A TERMINAL, as the person's press asks. The caller has already checked that the person
 * pressed (src/server/api/terminal-agents.ts). Every refusal below happens before anything is written or opened.
 */
export async function openTheAgentInATerminal(input: {
  reference: string
  resume: boolean
  workspaceId: string
  actor: Actor
  cols: number
  rows: number
}): Promise<AnAgentOpened> {
  const named = theAgentAnArrivingReferenceNames(input.reference, 'writing')
  if (named === null) {
    throw aTerminalRefusal('terminalAgentNotFound', `No agent answers to "${input.reference}". Nothing was opened.`, 404)
  }
  const agent = named.agent
  if (agent.retired) {
    throw aTerminalRefusal('terminalAgentRetired', `${agent.handle} is retired, so it was not opened in a terminal.`, 409)
  }
  const runtime = runtimeOfTheAgentRecord(agent.id)
  if (runtime === null) {
    throw aTerminalRefusal(
      'terminalAgentNoRuntime',
      `${agent.handle}'s agent record names no runtime, so the office does not know which program to open. Nothing was opened.`,
      409,
    )
  }
  if (runtime === 'dsh') {
    throw aTerminalRefusal('terminalAgentDshNotInteractive', `${agent.handle} runs on dsh, and the office does not start dsh interactively. Nothing was opened.`, 409)
  }
  if (!isOpenedRuntime(runtime)) {
    throw aTerminalRefusal('terminalAgentNoRuntime', `${agent.handle} runs on ${runtime}, which the office does not open in a terminal. Nothing was opened.`, 409)
  }
  // THE RECORDED START FOLDER, OR WITH NONE THE AGENT'S OWN, and no other. A recorded folder that is gone is refused,
  // never replaced.
  const recorded = theStartFolderOf(agent.id, input.workspaceId)
  if (recorded !== null && !aFolderIsThere(recorded)) {
    throw aTerminalRefusal('terminalAgentStartFolderGone', `${agent.handle}'s start folder ${recorded} is not a folder on this computer now, so it was not opened.`, 409)
  }
  const base = theEnvironmentATerminalGets()
  const program = THE_PROGRAM_FOR_RUNTIME[runtime]
  const where = whereIsThisTool(program, base['PATH'])
  if (where === null) {
    throw aTerminalRefusal(
      'terminalAgentProgramMissing',
      `${runtime} runs the program "${program}", and no "${program}" is on the PATH this server gives its terminals. Nothing was opened.`,
      409,
    )
  }
  if (recorded === null && input.resume) {
    throw aTerminalRefusal(
      'terminalAgentNoStartFolder',
      `${agent.handle} has no start folder recorded in this project, so there is no conversation of it to continue, and it ` +
        'was not opened. Open it without "resume", and the office makes a folder of its own for it.',
      409,
    )
  }
  // MADE AND RECORDED ONLY NOW, after every refusal that needs no folder, so a refused open leaves none behind.
  const folder = recorded ?? theAgentsOwnFolderRecorded(agent, input.workspaceId, input.actor)
  let command: ACommand
  if (input.resume) {
    const resumed = theResumeCommand(runtime, theLastConversationOf(agent.id, folder, runtime))
    if ('cannot' in resumed) {
      throw aTerminalRefusal(
        'terminalAgentNothingToResume',
        `${agent.handle} cannot be continued in ${folder}: ${resumed.cannot}. Nothing was opened. Open it without "resume" to start a new conversation.`,
        409,
      )
    }
    command = resumed
  } else {
    command = theOpeningCommand(runtime)
  }
  return await openTheRun({
    agent,
    runtime,
    folder,
    where,
    program,
    args: command.args,
    providerSession: command.providerSession,
    base,
    workspaceId: input.workspaceId,
    actor: input.actor,
    cols: input.cols,
    rows: input.rows,
    title: `${agent.handle} in a terminal`,
    doing: `Works in a terminal the office holds, opened by ${atWhosePress(input.actor)}.`,
    extra: {},
  })
}

/**
 * THE AGENT'S OWN FOLDER, MADE WHEN IT IS NOT THERE AND RECORDED AS ITS START FOLDER IN THIS PROJECT, for an agent
 * opened with none recorded. The record is written by the start folder door with the opener as its writer, so the mark
 * on it says who pressed. Refused in words with terminalAgentNoStartFolder, and the folder removed when this call made
 * it, when the folder cannot be made, when another agent's record names it, or when the record cannot be written.
 */
function theAgentsOwnFolderRecorded(agent: { id: string; handle: string }, workspaceId: string, actor: Actor): string {
  const refused = (because: string): Error =>
    aTerminalRefusal(
      'terminalAgentNoStartFolder',
      `${agent.handle} has no start folder recorded in this project, and the office could not make one of its own for it: ` +
        `${because.replace(/\.$/u, '')}. Nothing was opened. Record a start folder with ` +
        `POST /api/participants/agent/${agent.handle}/start-folder, and it opens there.`,
      409,
    )
  let made: { folder: string; madeNow: boolean }
  try {
    made = makeTheAgentsOwnFolder(agent.handle)
  } catch (error) {
    throw refused((error as Error).message)
  }
  // A FOLDER MADE NOW AND NOT USED IS REMOVED, and a removal that fails is said beside the first reason, never in its place.
  const andRemoved = (because: string): string => {
    if (!made.madeNow) return because
    try {
      rmdirSync(made.folder)
      return because
    } catch (error) {
      return `${because.replace(/\.$/u, '')}; and ${made.folder}, made for it, could not be removed: ${(error as Error).message}`
    }
  }
  const whose = anotherAgentWhoseRecordNames(made.folder, agent.id)
  if (whose !== null) throw refused(andRemoved(`${made.folder} is the start folder of ${whose}, and two agents never share one`))
  try {
    changeStartFolder(
      agent.id,
      workspaceId,
      made.folder,
      `The office made this folder for it when ${atWhosePress(actor)} opened it in a terminal with no start folder recorded.`,
      actor,
    )
  } catch (error) {
    if (!(error instanceof PanelError)) throw error
    throw refused(andRemoved(error.message))
  }
  return made.folder
}

/**
 * WHICH OTHER AGENT'S RECORD NAMES `folder` AS ITS START FOLDER, a retired agent's too, or null. A handle is free again
 * once its agent is retired, so a new agent's own folder may be the one a retired agent of that handle was given.
 * The records are read by theAgentRecordsNamingTheStartFolder (lib/terminals/agent-records-naming-a-start-folder.ts),
 * which agentsStartingIn (lib/participants.ts) reads with retired agents left out. A record that maps to no agent is
 * named by its id, because the office cannot tell it is not another agent's.
 */
export function anotherAgentWhoseRecordNames(folder: string, agentId: string): string | null {
  for (const { record, agent } of theAgentRecordsNamingTheStartFolder(folder, { retiredAgents: 'counted' })) {
    if (agent === null) return `the agent record ${record}, whose agent the office cannot read`
    if (agent.id !== agentId) return `another agent, ${agent.id}`
  }
  return null
}

/**
 * WHOSE PRESS OPENED IT: the person, the secretary itself, or the secretary under the grant.
 * The caller has checked the authority (src/server/api/terminal-agents.ts).
 */
function atWhosePress(actor: Actor): string {
  const grant = actor.press?.underTheGrant
  if (grant !== undefined) return `${actor.id} for the person under their grant ${grant}`
  return actor.type === 'agent' ? actor.id : 'the person'
}

/**
 * WHO OPENED A TERMINAL, AS THE HOLDER KEEPS IT: the person or the secretary that pressed,
 * so a terminal opened under the grant is not listed as one the person opened. Asked by every door that opens an agent's
 * terminal or a view of its pane (lib/agent-pane.ts).
 */
export function whoOpensIt(actor: Actor): TerminalParty {
  if (actor.type !== 'agent') return { kind: 'person', id: THE_PERSON }
  const named = participantForActor(actor)
  if (named === null || named.kind !== 'agent') {
    throw new PanelError(
      `"${actor.id}" pressed this, and no agent in the registry answers to it, so the office ` +
        'cannot say who opened the terminal. Nothing was opened.',
      500,
    )
  }
  return { kind: 'agent', id: named.id }
}

/**
 * FILE A TERMINAL'S RUN AND MAKE ITS KEY. THE RECORD AND THE KEY ARE ONE TRANSACTION, as mintARunKey's are: both are
 * stored or neither is. The key is bound to the run by `recordTheOriginalRunKeyMint`, as the session door's mint is, at
 * the key row's own moment, so a session header the key carries is read against this run (lib/the-run-a-key-holds.ts).
 * A press that proves nothing gets the run and no key, and so does a press under the person's grant (the file's header).
 */
export function fileATerminalsRunAndItsKey(o: {
  agent: { id: string; handle: string }
  runtime: OpenedRuntime
  folder: string
  providerSession: string | null
  workspaceId: string
  actor: Actor
  title: string
  doing: string
  extra: Record<string, unknown>
}): { session: string; key: string | null } {
  const proof = howThisPressProvesTheKeyItMakes(o.actor)
  const grant = o.actor.press?.underTheGrant
  const giveAKey = grant === undefined && aKeyMadeThisWayIsProved(proof)
  return sqlite.transaction(() => {
    const filed = createRecord({
      kind: 'session',
      title: o.title,
      workspaceId: o.workspaceId,
      data: {
        state: 'running',
        runtime: o.runtime,
        startedAt: nowStamp(),
        doing: o.doing,
        workingDirectory: o.folder,
        servingAgent: o.agent.handle,
        servingAgentId: o.agent.id,
        ...(o.providerSession === null ? {} : { providerSession: o.providerSession }),
        startedByMoleOffice: true,
        extra: { ...o.extra, openedBy: { type: o.actor.type, id: o.actor.id, ...(grant === undefined ? {} : { underTheGrant: grant }) } },
      },
      actor: theOffice(),
    })
    if (!giveAKey) return { session: filed.id, key: null }
    const made = makeARunKey(o.agent.id, proof)
    recordTheOriginalRunKeyMint(filed.id, made.heldKeyId, theOffice())
    return { session: filed.id, key: made.key }
  })()
}

/**
 * FILE THE RUN, MAKE ITS KEY AND OPEN IT IN THE HOLDER: the part an agent's open press and the way back's press share.
 * Every refusal is the caller's, before this is called; from here the run is written, and ended again if nothing opens.
 */
async function openTheRun(o: {
  agent: { id: string; handle: string }
  runtime: OpenedRuntime
  folder: string
  where: string
  program: string
  args: string[]
  providerSession: string | null
  base: Record<string, string>
  workspaceId: string
  actor: Actor
  cols: number
  rows: number
  title: string
  doing: string
  extra: Record<string, unknown>
}): Promise<AnAgentOpened> {
  const { agent, runtime, folder, where, program } = o
  const input = o
  const off = withTheHarnessFeaturesOff(runtime, o.args, o.base)
  const base = off.env
  const command = { args: off.args, providerSession: o.providerSession }
  const folderToOpen = trustBeforeOpening(runtime, folder, agent.id, o.workspaceId, base)
  const hello = await theHolder()
  // A SERVER THAT ANSWERS ON NO ADDRESS IS REFUSED HERE, before the record is written, and not after.
  theOfficesAddress()
  // AND SO IS A PRESS WHOSE PRESSER CANNOT BE NAMED.
  const who = whoOpensIt(o.actor)

  const { session, key } = fileATerminalsRunAndItsKey({ ...o, providerSession: command.providerSession })
  const giveAKey = key !== null

  let terminal: TerminalReading
  try {
    const answer = await askTheHolderFor({
      op: 'open',
      who,
      agent: { kind: 'agent', id: agent.id } satisfies TerminalParty,
      project: input.workspaceId,
      command: where,
      args: command.args,
      folder: folderToOpen,
      env: theAgentsEnvironment(base, { workspaceId: input.workspaceId, handle: agent.handle, session, key }),
      cols: input.cols,
      rows: input.rows,
      // ON WHEN IT OPENS, as in every terminal the person opens (decision YLv8grhgilBV, point 1).
      keeping: true,
    })
    terminal = answer['terminal'] as TerminalReading
  } catch (err) {
    // NOTHING OPENED, SO THE RUN ENDS NOW, and its key with it.
    endTheRunOf(session, null, 'crashed', 'went-stale', `The terminal holder did not open it: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
  const record = getRecord(session)!
  patchRecord(
    session,
    { dataPatch: { extra: { ...extraOf(record.data), inATerminal: { terminal: terminal.id, holder: { pid: hello.pid, startedAt: hello.startedAt } } satisfies InATerminal } } },
    theOffice(),
  )
  watchTheAgentsTerminal(session, terminal.id)

  const grant = o.actor.press?.underTheGrant
  const keySays = giveAKey
    ? `This run was given a run key of its own, in its terminal's environment as MOLE_AGENT_KEY and nowhere else. It is revoked when the run ends.`
    : grant !== undefined
      ? `This run was given no key, because ${o.actor.id} pressed it under the person's grant ${grant}. Its waiter cannot hold ` +
        'its handle until it has a key. The person may press again, or a secretary may open the agent on its own proved starter key.'
      : o.actor.type === 'agent'
        ? `This run was given no key, because ${o.actor.id}, who pressed it, does not hold only proved live keys. Its waiter cannot hold its handle until it has a key.`
        : 'This run was given no key, because this press did not carry the person\'s key. Its waiter cannot hold its handle ' +
        'until it has a key. Press again from a paired browser, or with the person\'s key, to open it with one.'
  return {
    terminal,
    session,
    agent: { id: agent.id, handle: agent.handle },
    runtime,
    folder,
    providerSession: command.providerSession,
    key: { given: giveAKey, says: keySays },
    says:
      `${agent.handle} is open in terminal ${terminal.id}, in ${folder}, running ${[program, ...command.args].join(' ')}. ` +
      `Its session record is ${session}. ${keySays}`,
  }
}

// ---------------------------------------------------------------------------------------
// THE WAY BACK (wave 13u, round 10)
// ---------------------------------------------------------------------------------------
//
// The person presses "Bring it back in Mole Office's terminal" on an agent's page, and the office opens the agent's
// newest run again in a terminal it holds, with the command src/config/the-way-back.mjs works out from that run's
// record: its folder, its conversation and the flags it started with. The run it opens is a new session record, filed
// as an agent's open press files one (openTheRun), naming the run it brings back in `extra.wayBackOf`.
//
// IT IS REFUSED WHILE THE RUN STILL RUNS. Two programs on one conversation would both write to it. A run still runs when
// the process its record names is that same claude program now (theRecordedProcess), or when it is in one of the
// office's terminals and its record has not ended. The record's state word alone is not read for this: a secretary that
// was resumed by hand keeps a record that says it finished while its program runs again (I1YvY7y7shXb).

/** The agent a reference names, refused in words when none does. */
function theAgentToBringBack(reference: string): { id: string; handle: string; retired: boolean } {
  const named = theAgentAnArrivingReferenceNames(reference, 'writing')
  if (named === null) throw aTerminalRefusal('terminalAgentNotFound', `No agent answers to "${reference}". Nothing was opened.`, 404)
  return named.agent
}

/**
 * WHETHER THE AGENT PRESSING IS ABOVE THE AGENT IT BRINGS BACK: the agent that started it, or a starter up that chain,
 * as the registry's starters say (`theChainUpWith`, the walk the session-filing rule and the participants page take).
 * After the agents have stopped they come back down the chain, one at a time, and each superior on this computer brings
 * back the agents below it, as the person can. No press brings every agent back.
 *
 * Only an agent's own key counts. A retired agent proves nothing here, because its keys are revoked when it retires
 * (api/participants.ts, revokeEveryLiveKeyHeldBy). The door asks where the press came from first (api/terminals.ts,
 * assertATerminalAgentIsHere). The agent brought back is read as a read reads it, so a retired one is found here and
 * refused by `bringTheRunBack` in its own words. The run key such a press makes is proved as the superior's own key is
 * (`howThisAgentsOwnKeyProvesAKey`), never as the person's press.
 */
export function aStarterAboveTheAgentPresses(actor: Actor, reference: string): boolean {
  if (actor.type !== 'agent' || actor.provedBy !== 'an-agent-key') return false
  const presser = participantForActor(actor)
  if (presser?.kind !== 'agent') return false
  const agent = theRowAnArrivingReferenceNames(reference, 'reading')
  if (agent === null || agent.id === presser.id) return false
  const { chain } = theChainUpWith(agent.startedBy, theStarterEachStringNames())
  return chain.some((one) => one.kind === 'agent' && one.id === presser.id)
}

/**
 * THE PROCESS A RUN'S PROGRAM RUNS AS NOW, by two readings: the process its record names, when that is the same claude
 * program now, and else any process whose arguments name its conversation (a run resumed by hand under a new process
 * its record does not name). Null with the sentence of what was read when neither finds one. Way B (the agent's tmux
 * pane, lib/agent-pane.ts) reads the same answer, so the two cannot come to disagree about which process is the run.
 */
export function theProcessOfTheRun(data: Record<string, unknown>, conversation: string | null): { pid: number | null; says: string } {
  const { pid, pidStartedAt } = theRecordedProcessOf({ data })
  const reading = theRecordedProcess(pid, pidStartedAt)
  if (reading.trusted && pid !== null) return { pid, says: reading.says }
  if (conversation === null) return { pid: null, says: `${reading.says}, and nobody recorded its conversation` }
  const naming = theProcessNamingTheConversation(conversation)
  if (naming !== null) return { pid: naming, says: `process ${String(naming)} names its conversation ${conversation} in its arguments` }
  return { pid: null, says: `${reading.says}, and no process names its conversation ${conversation}` }
}

/**
 * Whether a run's program runs now, and the sentence saying what was read: its process (theProcessOfTheRun), or the
 * office's own terminal while its record has not ended.
 */
function whetherTheRunStillRuns(data: Record<string, unknown>, conversation: string): { running: boolean; says: string } {
  const process = theProcessOfTheRun(data, conversation)
  if (process.pid !== null) return { running: true, says: `It still runs: ${process.says}.` }
  const held = inATerminalOf(data)
  if (held !== null && !theRunHasEnded(data['state'])) {
    return { running: true, says: `It still runs: it is in the office's terminal ${held.terminal}, and its record has not ended.` }
  }
  return { running: false, says: `It does not run now: ${process.says}.` }
}

/** A process whose arguments resume or start this claude conversation, or a codex process resuming this thread; null when none does. Any program counts for claude, so a doubt refuses the press. */
function theProcessNamingTheConversation(conversation: string): number | null {
  const every = theProcessReader().everyCommandLine()
  if (every === null) return null
  for (const { pid, command } of every) {
    if (claudeConversationIn(command) === conversation || (namesTheCodexProgram(command) && codexThreadIn(command) === conversation)) return pid
  }
  return null
}

/**
 * The way back to an agent's newest run, as the agent's page reads it. A run that names no serving agent counts when the
 * agent filed it or later wrote to it (`theNewestRunTheResumeLineShows` in lib/session-origins.ts), and that gives no holding.
 */
export function theWayBackOfTheAgent(reference: string, workspaceId: string): AWayBack {
  const agent = theAgentToBringBack(reference)
  const newest = theNewestRunTheResumeLineShows(agent.id, agent.handle, workspaceId)
  const who = { id: agent.id, handle: agent.handle }
  if (newest === undefined) {
    return { agent: who, run: null, way: { way: 'none', runtime: null, because: 'The office has no record of a run of this agent.' }, press: 'none', says: 'No session record serves this agent.' }
  }
  const record = getRecord(newest.id)
  const run = { id: newest.id, title: record?.title ?? newest.id, createdAt: newest.createdAt }
  const way = theWayBackOf({ id: newest.id, data: newest.data }) as AWayBack['way'] & { sandbox?: unknown }
  if (way.way === 'none') return { agent: who, run, way, press: 'none', says: `Its record ${newest.id} has no way back: ${way.because}` }
  if (way.way === 'sandbox') {
    const { sandbox: _forThePress, ...shown } = way as Extract<AWayBack['way'], { way: 'sandbox' }> & { sandbox?: unknown }
    return {
      agent: who,
      run,
      way: shown,
      press: 'sandbox',
      says: `Its record ${newest.id} ran in a sandbox. Opening a terminal inside a sandbox waits for tools/sandbox.mjs exec --tty, so only the command is shown.`,
    }
  }
  const still = whetherTheRunStillRuns(newest.data, way.sessionId)
  return { agent: who, run, way, press: still.running ? 'running' : 'ready', says: `From its record ${newest.id}. ${still.says}` }
}

/**
 * BRING AN AGENT'S RUN BACK IN A TERMINAL THE OFFICE HOLDS, as the person's press asks, or the press of an agent above
 * it in its chain of starters (`aStarterAboveTheAgentPresses`). The caller has already checked that one of them
 * pressed (src/server/api/terminal-agents.ts) and says which in `pressedByAStarterAboveIt`. Every refusal below
 * happens before anything is written.
 */
export async function bringTheRunBack(input: {
  reference: string
  session: string
  workspaceId: string
  actor: Actor
  pressedByAStarterAboveIt: boolean
  cols: number
  rows: number
}): Promise<AnAgentOpened> {
  const agent = theAgentToBringBack(input.reference)
  if (agent.retired) throw aTerminalRefusal('terminalAgentRetired', `${agent.handle} is retired, so it was not brought back.`, 409)
  // THE PRESS FINDS WHAT THE LINE SHOWS: a run serving the agent, or one that counts for it on the resume line.
  const { run, any } = theRunTheResumeLineCounts(agent.id, agent.handle, input.session)
  if (!any) throw aTerminalRefusal('wayBackNoRun', `The office has no record of a run of ${agent.handle}. Nothing was opened.`, 404)
  if (run === undefined) throw aTerminalRefusal('wayBackNotThisAgents', `${input.session} is not a run of ${agent.handle}. Nothing was opened.`, 409)
  // A RUN FILED IN ANOTHER PROJECT is refused as every record from another project is: 404, naming where it is.
  recordInWorkspace(run.id, input.workspaceId)
  const way = theWayBackOf({ id: run.id, data: run.data })
  if (way.way === 'none') throw aTerminalRefusal('wayBackNone', `${run.id} has no way back: ${way.because} Nothing was opened.`, 409)
  if (way.way === 'sandbox') {
    throw aTerminalRefusal(
      'wayBackInASandbox',
      `${run.id} ran in a sandbox, and the office cannot open a terminal inside a sandbox until tools/sandbox.mjs exec --tty is there. Nothing was opened.`,
      409,
    )
  }
  const still = whetherTheRunStillRuns(run.data, way.sessionId)
  if (still.running) {
    throw aTerminalRefusal('wayBackStillRunning', `${run.id} is not brought back while it runs. ${still.says} Nothing was opened.`, 409)
  }
  if (!aFolderIsThere(way.folder)) {
    throw aTerminalRefusal('wayBackFolderGone', `${run.id} worked in ${way.folder}, which is not a folder on this computer now. Nothing was opened.`, 409)
  }
  const runtime = way.runtime
  if (!isOpenedRuntime(runtime)) throw aTerminalRefusal('wayBackNone', `${run.id} ran on ${runtime}, which the office does not open in a terminal. Nothing was opened.`, 409)
  const base = theEnvironmentATerminalGets()
  const where = whereIsThisTool(way.program, base['PATH'])
  if (where === null) {
    throw aTerminalRefusal(
      'terminalAgentProgramMissing',
      `${runtime} runs the program "${way.program}", and no "${way.program}" is on the PATH this server gives its terminals. Nothing was opened.`,
      409,
    )
  }
  return await openTheRun({
    agent,
    runtime,
    folder: way.folder,
    where,
    program: way.program,
    args: way.args,
    providerSession: way.sessionId,
    base,
    workspaceId: input.workspaceId,
    actor: input.actor,
    cols: input.cols,
    rows: input.rows,
    title: `${agent.handle} brought back in a terminal`,
    doing: input.pressedByAStarterAboveIt
      ? `Brought back in a terminal the office holds, at the press of ${input.actor.id}, an agent above it in its chain of starters, continuing the run ${run.id}.`
      : input.actor.press?.underTheGrant === undefined
        ? `Brought back in a terminal the office holds, at the person's press, continuing the run ${run.id}.`
        : `Brought back in a terminal the office holds, at the press of ${atWhosePress(input.actor)}, continuing the run ${run.id}.`,
    extra: { wayBackOf: run.id, wayBackCommand: way.command },
  })
}

// ---------------------------------------------------------------------------------------
// ENDING
// ---------------------------------------------------------------------------------------

/**
 * END THE RUN OF AN AGENT IN A TERMINAL, unless it has already ended or has moved to another terminal since. Ending it
 * revokes its run key (lib/records.ts, on the transition). `terminal` null ends it whatever terminal it names.
 *
 * THE WORDS FOLLOW THE SESSION KIND'S OWN (src/shared/kinds.ts): finished is a clean exit, crashed is died or stopped
 * without finishing. A clean exit is closed as `went-stale`, the close the office writes when it finds a run's process
 * gone (src/config/own-rows.mjs, theDeadOwnRowPatch): the program ended, and nobody said whether its work was finished
 * or what it submits, so the office seals nothing for it. A person closing the terminal is `person-said`, and crashed,
 * as a person's stop of a run is (lib/worker.ts). `because` is the plain sentence of what was observed.
 *
 * THE SAME PATCH CARRIES THE RUN'S USAGE RECEIPT (lib/terminal-run-receipt.ts, wave 13s round 40), except a Claude Code
 * run's, which its session hook writes.
 */
function endTheRunOf(session: string, terminal: string | null, state: 'finished' | 'crashed', closedHow: 'went-stale' | 'person-said' | 'agent-said', because: string): void {
  const record = getRecord(session)
  if (record === null || record.kind !== 'session' || theRunHasEnded(record.data['state'])) return
  if (terminal !== null && inATerminalOf(record.data)?.terminal !== terminal) return
  const usageReceipt = theReceiptAtATerminalsEnd(record, theEnvironmentATerminalGets())
  patchRecord(
    session,
    { dataPatch: { state, closedAt: nowStamp(), closedHow, closedBecause: because, detail: because, doing: because, ...(usageReceipt === null ? {} : { usageReceipt }) } },
    theOffice(),
  )
}

/** How a terminal's end reads on its run. */
function howItEnded(exit: { code: number; signal: number | null } | null): { state: 'finished' | 'crashed'; because: string } {
  if (exit === null) return { state: 'crashed', because: 'Its terminal ended, and the holder recorded no exit.' }
  if (exit.signal !== null && exit.signal !== 0) return { state: 'crashed', because: `Its program in the terminal was stopped by signal ${String(exit.signal)}.` }
  if (exit.code === 0) return { state: 'finished', because: 'Its program in the terminal ended with exit code 0. Nobody said whether its work was finished.' }
  return { state: 'crashed', because: `Its program in the terminal ended with exit code ${String(exit.code)}.` }
}

/** The watch on each agent's terminal, by session record, so one terminal is watched once. */
const watching = new Map<string, { terminal: string; stop: () => void } | 'starting'>()

/** A close in flight, so a holder's close event keeps the secretary's attribution. */
const secretaryClosing = new Map<string, string>()

const aSecretarysCloseSaid = (secretary: string): string => `The secretary ${secretary} closed its terminal, and its program was sent SIGHUP.`

/** Close an owned agent terminal after the route checked ownership, and end only runs bound to it. */
export async function closeTheTerminalAsSecretary(terminal: string, secretary: string): Promise<Record<string, unknown>> {
  const sessions = theRunningAgentsInTerminals().filter(session => theOfficeTerminalOfTheRun(getRecord(session)!.data) === terminal)
  secretaryClosing.set(terminal, secretary)
  try {
    const answer = await askTheHolderFor({ op: 'close', terminal })
    // The watcher may receive its event before or after this reply, including from an older holder.
    for (const session of sessions) endTheRunOf(session, terminal, 'crashed', 'agent-said', aSecretarysCloseSaid(secretary))
    return answer
  } finally { secretaryClosing.delete(terminal) }
}

/**
 * HOW LONG AN END BY SIGHUP WAITS BEFORE IT ENDS THE RUN. A holder that is asked to stop sends SIGHUP to every terminal
 * and stops within three seconds (STOP_WAIT_MS in src/holder/index.mjs), and such a run is to be opened again, not
 * ended. So an end by SIGHUP that came with no close ends the run only if the holder's connection is still there after
 * this long; if the connection drops first, the holder stopped, and the run waits for the next holder.
 */
const A_HANG_UP_WAITS_MS = 5_000
const SIGHUP = 1

/** WATCH AN AGENT'S TERMINAL, so its run ends when its program ends or the person closes it. */
function watchTheAgentsTerminal(session: string, terminal: string): void {
  const now = watching.get(session)
  if (now === 'starting' || (now !== undefined && now.terminal === terminal)) return
  if (now !== undefined) now.stop()
  watching.set(session, 'starting')
  let aHangUp: NodeJS.Timeout | null = null
  const end = (state: 'finished' | 'crashed', closedHow: 'went-stale' | 'person-said' | 'agent-said', because: string): void => {
    try {
      endTheRunOf(session, terminal, state, closedHow, because)
    } catch (err) {
      log.warn(`The run ${session} in terminal ${terminal} ended, and its record could not be ended: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  watchATerminal(
    terminal,
    (event) => {
      if (event.event === 'ended') {
        const ended = howItEnded(event.exit)
        if (event.exit.signal === SIGHUP) {
          aHangUp = setTimeout(named('a hung-up run\'s end', (line) => log.warn(line), () => end(ended.state, 'went-stale', ended.because)), A_HANG_UP_WAITS_MS)
          aHangUp.unref()
        } else {
          end(ended.state, 'went-stale', ended.because)
        }
      } else if (event.event === 'closed') {
        if (aHangUp !== null) clearTimeout(aHangUp)
        const secretary = secretaryClosing.get(terminal)
        if (secretary === undefined) end('crashed', 'person-said', 'The person closed its terminal, and its program was sent SIGHUP.')
        else end('crashed', 'agent-said', aSecretarysCloseSaid(secretary))
      }
    },
    () => {
      // THE CONNECTION DROPPED: the holder stopped, most likely. A hang-up it sent does not end the run, and the server
      // looks for the holder that comes next, which opens the run again.
      if (aHangUp !== null) clearTimeout(aHangUp)
      if ((watching.get(session) as { terminal?: string } | undefined)?.terminal === terminal) watching.delete(session)
      lookForTheNextHolder()
    },
  ).then(
    (watch) => {
      if (watching.get(session) === 'starting') watching.set(session, { terminal, stop: watch.stop })
      else watch.stop()
    },
    (err: unknown) => {
      watching.delete(session)
      log.warn(`The terminal ${terminal} of the run ${session} could not be watched: ${err instanceof Error ? err.message : String(err)}`)
    },
  )
}

/** How often, and for how long, the server asks for a holder after a watched terminal's connection dropped. */
const LOOK_EVERY_MS = 2_000
const LOOK_FOR_MS = 60_000
let looking = false

/** Ask for the holder until one answers or a minute has passed. `theHolder` records a new one and reconciles. */
function lookForTheNextHolder(): void {
  if (looking) return
  looking = true
  const until = Date.now() + LOOK_FOR_MS
  // NAMED, so a long run is a line in the log and the loop watch can say whose a hold was (lib/named-timers.ts).
  const look = named('the look for the terminal holder', (line) => log.warn(line), (): void => {
    theHolder().then(
      (hello) => {
        looking = false
        // THE SAME HOLDER: a watch was let go for another reason. Watch its agents again.
        void reconcileTheAgentsInTerminals(hello)
      },
      () => {
        if (Date.now() >= until) {
          looking = false
          log.info('No terminal holder answered for a minute after one stopped. The next terminal door used, or the server\'s next start, notices a new one.')
          return
        }
        setTimeout(look, LOOK_EVERY_MS).unref()
      },
    )
  })
  setTimeout(look, LOOK_EVERY_MS).unref()
}

// ---------------------------------------------------------------------------------------
// AFTER THE HOLDER RESTARTS
// ---------------------------------------------------------------------------------------

/** One agent opened again, or not, for the person's message. */
type AReopening = { session: string; handle: string; back: true; runtime: string; command: string; reaches: string } | { session: string; handle: string; back: false; because: string }

/** Every reconciling runs after the one before, so two never open the same agent twice. */
let theLastReconciling: Promise<void> = Promise.resolve()

/**
 * BRING THE AGENTS IN TERMINALS INTO STEP WITH THE HOLDER THAT ANSWERS NOW. Called by `theHolder` when it records a
 * holder it had not recorded, which includes the server's start. Never throws: what goes wrong is logged.
 *
 * - A run whose record names this holder is watched; one whose terminal this holder no longer holds, or that ended
 *   while nobody watched, ends its record.
 * - A run whose record names another holder is opened again with its resume command, or closed with its cause, and
 *   the person is told in one message.
 */
export function reconcileTheAgentsInTerminals(hello: HolderHello): Promise<void> {
  theLastReconciling = theLastReconciling.then(() =>
    reconcile(hello).catch((err: unknown) => {
      log.warn(`The agents in the office's terminals could not be brought into step with the holder, process ${String(hello.pid)}: ${err instanceof Error ? err.message : String(err)}`)
    }),
  )
  return theLastReconciling
}

async function reconcile(hello: HolderHello): Promise<void> {
  const running = theRunningAgentsInTerminals()
  if (running.length === 0) return
  const ofThisHolder: { session: string; terminal: string }[] = []
  const ofAnEarlierHolder: string[] = []
  for (const session of running) {
    const held = inATerminalOf(getRecord(session)!.data)
    if (held === null) continue
    if (theSameHolder(held.holder, hello)) ofThisHolder.push({ session, terminal: held.terminal })
    else ofAnEarlierHolder.push(session)
  }

  if (ofThisHolder.length > 0) {
    const listed = (await askTheHolderFor({ op: 'list' }))['terminals'] as TerminalReading[]
    for (const one of ofThisHolder) {
      const terminal = listed.find((t) => t.id === one.terminal)
      if (terminal === undefined) {
        endTheRunOf(one.session, one.terminal, 'finished', 'went-stale', 'Its terminal is no longer held by the terminal holder: it was closed while the server was not watching.')
      } else if (terminal.state === 'ended') {
        const ended = howItEnded(terminal.exit)
        endTheRunOf(one.session, one.terminal, ended.state, 'went-stale', ended.because)
      } else {
        watchTheAgentsTerminal(one.session, one.terminal)
      }
    }
  }

  if (ofAnEarlierHolder.length === 0) return
  const told: AReopening[] = []
  for (const session of ofAnEarlierHolder) told.push(await reopenOne(session, hello))
  writeASystemLineToOne(
    { kind: 'person', id: THE_PERSON } satisfies ParticipantRef,
    MESSAGE_CENTRE,
    SYSTEM_LINES.agentsInTerminalsAfterTheHolderRestarted(theMessage(told)),
    theOffice(),
    undefined,
    { agentsInTerminals: { holder: { pid: hello.pid, startedAt: hello.startedAt }, back: told.filter((one) => one.back).map((one) => one.session), notBack: told.filter((one) => !one.back).map((one) => one.session) } },
  )
}

/** The person's message: who came back, with which command, and who did not, and why. */
function theMessage(told: readonly AReopening[]): string {
  const back = told.filter((one): one is Extract<AReopening, { back: true }> => one.back)
  const notBack = told.filter((one): one is Extract<AReopening, { back: false }> => !one.back)
  const lines = [
    `The terminal holder restarted. A holder that stops ends its terminals, so ` +
      `${told.length === 1 ? 'the agent that worked in one was' : `the ${String(told.length)} agents that worked in them were`} cut off.`,
  ]
  if (back.length > 0) {
    lines.push(
      `Opened again: ${back.map((one) => `${one.handle} (${one.runtime}, "${one.command}", which reaches ${one.reaches}; session record ${one.session})`).join('; ')}.`,
    )
  }
  if (notBack.length > 0) {
    lines.push(`Not opened again: ${notBack.map((one) => `${one.handle}, because ${one.because} (its session record ${one.session} is closed with that cause)`).join('; ')}.`)
  }
  return lines.join(' ')
}

/** The proof word of the run key a record names, while that key is live, or null. */
function theLiveRunKeyOf(data: Record<string, unknown>): { id: string; proof: HowAKeysMintWasProved | null } | null {
  const id = said(extraOf(data)['runKeyId'])
  if (id === null) return null
  const row = sqlite.prepare('SELECT mint_proved_by AS proof, revoked_at AS revoked FROM held_keys WHERE id = ?').get(id) as
    | { proof: string | null; revoked: string | null }
    | undefined
  if (row === undefined || row.revoked !== null) return null
  return { id, proof: row.proof === null ? null : (nowSaid(KEY_MINT_WORDS_RENAMED, row.proof) as HowAKeysMintWasProved) }
}

/**
 * A REOPENED RUN'S NEW KEY IN PLACE OF ITS OLD ONE, answered as the new key's value. The old key is revoked and the new
 * one made and bound in one transaction, by `replaceTheRunKeyOfAReopenedRun` in lib/records.ts, and that binding is the
 * only one a session header is read against after a reopen. It throws, and writes nothing, where the old key was
 * revoked already.
 */
export function giveAReopenedRunANewKey(session: string, agentId: string, old: { id: string; proof: HowAKeysMintWasProved | null }): string {
  return replaceTheRunKeyOfAReopenedRun(session, old.id, agentId, old.proof, `The run ${session} was opened again after the terminal holder restarted, with a new key in place of this one.`).key
}

/**
 * OPEN ONE AGENT AGAIN WITH ITS RESUME COMMAND, or close its record with the cause. Answers what to tell the person.
 *
 * ITS NEW KEY REPLACES THE OLD ONE. The old run key was in the ended terminal's environment only, and the office
 * keeps no value, so the new terminal needs a new key. The old one is revoked and a new one made in one transaction,
 * and the new key's mint is recorded as the old one's was: it continues the run the person's press started, as a
 * granted ask hands out its key later under the press that granted it (lib/provedkeys.ts). A run that had no key
 * gets none.
 */
async function reopenOne(session: string, hello: HolderHello): Promise<AReopening> {
  const record = getRecord(session)!
  const data = record.data
  const handle = said(data['servingAgent']) ?? said(data['servingAgentId']) ?? 'an agent nobody recorded'
  const notBack = (because: string): AReopening => {
    try {
      endTheRunOf(session, null, 'crashed', 'went-stale', `The terminal holder restarted, and it was not opened again: ${because}.`)
    } catch (err) {
      return { session, handle, back: false, because: `${because}, and its record could not be closed: ${err instanceof Error ? err.message : String(err)}` }
    }
    return { session, handle, back: false, because }
  }
  try {
    const runtime = said(data['runtime'])
    if (runtime === null) return notBack('its session record names no runtime')
    if (!isOpenedRuntime(runtime)) return notBack(`its runtime, ${runtime}, is not one the office opens in a terminal`)
    const folder = said(data['workingDirectory'])
    if (folder === null) return notBack('its session record names no folder')
    if (!aFolderIsThere(folder)) return notBack(`its folder ${folder} is not a folder on this computer any more`)
    const agentId = said(data['servingAgentId'])
    const named = agentId === null ? null : theAgentAnArrivingReferenceNames(agentId, 'reading')
    if (named === null) return notBack('its session record names no agent the registry holds')
    if (named.agent.retired) return notBack(`${named.agent.handle} is retired`)
    const base = theEnvironmentATerminalGets()
    const where = whereIsThisTool(THE_PROGRAM_FOR_RUNTIME[runtime], base['PATH'])
    if (where === null) return notBack(`no "${THE_PROGRAM_FOR_RUNTIME[runtime]}" is on the PATH this server gives its terminals`)
    const resumed = theResumeCommand(runtime, said(data['providerSession']))
    if ('cannot' in resumed) return notBack(resumed.cannot)
    const off = withTheHarnessFeaturesOff(runtime, resumed.args, base)
    const command = { ...resumed, args: off.args }

    const workspaceId = record.workspaceId
    const folderToOpen = trustBeforeOpening(runtime, folder, named.agent.id, workspaceId, base)
    const old = theLiveRunKeyOf(data)
    const key = old === null ? null : giveAReopenedRunANewKey(session, named.agent.id, old)
    let terminal: TerminalReading
    try {
      const answer = await askTheHolderFor({
        op: 'open',
        // THE OFFICE OPENED THIS ONE, not the person: it continues the run the person's press started.
        who: { kind: 'agent', id: moleOffice().id } satisfies TerminalParty,
        agent: { kind: 'agent', id: named.agent.id } satisfies TerminalParty,
        project: workspaceId,
        command: where,
        args: command.args,
        folder: folderToOpen,
        env: theAgentsEnvironment(off.env, { workspaceId, handle: named.agent.handle, session, key }),
        // THE HOLDER'S FIRST SIZE, until a page fits it.
        cols: THE_FIRST_SIZE.cols,
        rows: THE_FIRST_SIZE.rows,
        // AS THE PERSON LEFT IT: a terminal they turned keeping off in stays off when it is opened again.
        keeping: inATerminalOf(getRecord(session)!.data)?.keeping !== false,
      })
      terminal = answer['terminal'] as TerminalReading
    } catch (err) {
      return notBack(`the new holder did not open it: ${err instanceof Error ? err.message : String(err)}`)
    }
    const line = [THE_PROGRAM_FOR_RUNTIME[runtime], ...command.args].join(' ')
    const now = getRecord(session)!.data
    const before = inATerminalOf(now)
    patchRecord(
      session,
      {
        dataPatch: {
          doing: `Works in a terminal the office holds; opened again with "${line}" after the terminal holder restarted.`,
          extra: {
            ...extraOf(now),
            inATerminal: {
              terminal: terminal.id,
              holder: { pid: hello.pid, startedAt: hello.startedAt },
              ...(before?.keeping === false ? { keeping: false } : {}),
              reopened: [...(before?.reopened ?? []), { at: nowStamp(), terminal: terminal.id, holder: { pid: hello.pid, startedAt: hello.startedAt }, command: line }],
            } satisfies InATerminal,
          },
        },
      },
      theOffice(),
    )
    watchTheAgentsTerminal(session, terminal.id)
    return { session, handle: named.agent.handle, back: true, runtime, command: line, reaches: whatTheResumeReaches(command) }
  } catch (err) {
    return notBack(`opening it again failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
