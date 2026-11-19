// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GPU WATCHER: THE ONE READER, THE ONE WRITER, AND THE STEP AT START. Wave 13v round 35b.
 *
 * The GPU watcher is the one agent, besides the owner, that may hand in a reading of the host GPU card and record a
 * cut-in step on a booking (src/server/lib/bookings.ts asks `isTheGpuWatcher`). Round 35 read it from the .env line
 * only. Nobody edits the live .env, so it is now a setting kept in the office, and the .env line is an override.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH ANSWER COUNTS
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE .ENV LINE, MOLE_OFFICE_GPU_WATCHER, when it names a handle. It wins, and the setting is not read in its
 *    place, even when no live agent bears that handle: whoever wrote the line chose it.
 * 2. THE SETTING, when the line names nobody: one agent's registry id, set on the Settings page or at
 *    POST /api/office/gpu-watcher. An agent that is not registered or is retired cannot watch, and then nobody does.
 * 3. NOBODY. Only the owner hands in a reading, and the refusal says how to name a watcher.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE SETTING LIVES
 * ---------------------------------------------------------------------------------------
 *
 * In the office's change log, on the row id `setting:gpu-watcher`, and nowhere else: no migration adds a column for
 * it. Every change is one row, written by `writeDownASettingChange`, whose `new_value` is the JSON
 * {"watcher": <registry id> | null, "because": <reason> | null}. The value in force is the newest row, read by
 * `theLastChangeOfASetting`, the same reader the Settings page's "Changed by" line uses. So the value and its history
 * are the same rows, and the two cannot disagree. No row means nobody has set it. A row whose watcher is null means
 * somebody chose nobody, and the step at start leaves that choice alone.
 *
 * ---------------------------------------------------------------------------------------
 * THE STEP AT START
 * ---------------------------------------------------------------------------------------
 *
 * An office that ran before this setting existed already has a watcher: the agent whose readings it accepted. When
 * the .env line names nobody and the setting has never been set, `takeTheGpuWatcherFromItsReadings` reads the
 * accepted readings in the request log. When they all came from one live agent, that agent is written as the
 * watcher, by the office itself, with the reason. Otherwise nothing is written and the line says why. No name is
 * written in this code.
 *
 * NOTHING IS CACHED. Every reading reads the .env line, the newest row and the registry again, so a change reaches the
 * very next reading of the card.
 */

import { sayInEnglish } from '@shared/i18n.ts'
import { moleOffice } from '@shared/participants.ts'
import { localStamp } from '@shared/time.ts'
import { sqlite } from '../db/client.ts'
import { theOneAgentAStringNames, type AgentIdentity } from './agent-references.ts'
import { theGpuWatcherHandle } from './env.ts'
import { type RegisteredAgent } from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. Only built when a reader or the writer refuses, never at import,
// so the import cycle through records.ts is safe.
import { theLastChangeOfASetting, writeDownASettingChange, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

/** The setting's name in the change log, after `setting:`. */
export const GPU_WATCHER_SETTING = 'gpu-watcher'

/** What every change row of the setting says was changed. */
const THE_FIELD = 'the GPU watcher'

/** The office itself, as the writer of the step at start. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/** How a watcher is named, said in every sentence that says nobody is one. */
export const HOW_TO_NAME_THE_GPU_WATCHER =
  'The owner or the holder of the secretary card names one on the Settings page or at POST /api/office/gpu-watcher, ' +
  'or MOLE_OFFICE_GPU_WATCHER names one.'

/** One agent as the panel offers it and as a reading names it. */
export interface AGpuWatcherChoice {
  id: string
  handle: string
  name: string
}

/** Why the agent the setting names cannot watch now. */
export type WhyTheStoredWatcherCannotWatch = 'not registered' | 'retired'

/**
 * WHO IS THE GPU WATCHER NOW, AND WHERE THAT CAME FROM.
 *
 *   the .env line            MOLE_OFFICE_GPU_WATCHER names `handle`; `agent` is the live agent bearing it, or null.
 *   set here                 nothing in the .env line, and the setting names `agent`, which can watch.
 *   set here, cannot watch   nothing in the .env line, and the setting names an agent that cannot watch now.
 *   nobody named             nothing in the .env line, and the setting names nobody or was never set.
 */
export type TheGpuWatcherInForce =
  | { from: 'the .env line'; handle: string; agent: AGpuWatcherChoice | null }
  | { from: 'set here'; agent: AGpuWatcherChoice }
  | { from: 'set here, cannot watch'; stored: string; storedName: string; cannotBecause: WhyTheStoredWatcherCannotWatch }
  | { from: 'nobody named' }

/** The whole reading, as GET /api/office/gpu-watcher answers it and the Settings panel draws it. */
export interface TheGpuWatcher {
  inForce: TheGpuWatcherInForce
  /** The registry id the setting holds, or null because it names nobody or was never set. */
  stored: string | null
  /** Whether anybody has set the setting, to an agent or to nobody. False means no change row exists. */
  everSet: boolean
  /** The reason given with the newest change, or null because none was given or nothing was set. */
  because: string | null
  /** The reading in one English sentence. The page says the same from the same word keys. */
  says: string
  /** Every live agent, in registry order. The panel offers these. */
  mayBeNamed: AGpuWatcherChoice[]
}

/** What one change row of the setting holds. */
interface AStoredChoice {
  watcher: string | null
  because: string | null
}

/** One registry row as the panel offers it. */
function asChoice(row: { id: string; handle: string; name: string }): AGpuWatcherChoice {
  return { id: row.id, handle: row.handle, name: row.name }
}

/**
 * THE NEWEST CHOICE, or null because nobody has set the setting. A row this office cannot read is refused loudly,
 * because a guess would let the wrong agent hand in readings, or nobody.
 */
function theStoredChoice(): AStoredChoice | null {
  const last = theLastChangeOfASetting(GPU_WATCHER_SETTING)
  if (last === null) return null
  let said: unknown
  try {
    said = last.to === null ? null : JSON.parse(last.to)
  } catch {
    said = undefined
  }
  const choice = said as Partial<AStoredChoice> | null | undefined
  if (
    typeof choice !== 'object' ||
    choice === null ||
    Object.keys(choice).sort().join(',') !== 'because,watcher' ||
    !(choice.watcher === null || (typeof choice.watcher === 'string' && choice.watcher !== '')) ||
    !(choice.because === null || typeof choice.because === 'string')
  ) {
    throw new PanelError(
      `The newest change to the GPU watcher in the change log holds ${JSON.stringify(last.to)}, and this office reads ` +
        'only {"watcher": an agent\'s id or null, "because": a reason or null} there. Nothing was guessed and nothing ' +
        'was changed.',
      500,
    )
  }
  return { watcher: choice.watcher, because: choice.because }
}

/** Why this agent cannot watch now, or null because it can. The writer and the reader ask this. */
function whyThisAgentCannotWatch(row: RegisteredAgent | null): WhyTheStoredWatcherCannotWatch | null {
  if (row === null) return 'not registered'
  if (row.retired) return 'retired'
  return null
}

/** Who is the GPU watcher now, without the list the panel offers. Asked on every reading of the card. */
function theGpuWatcherInForce(stored: AStoredChoice | null): TheGpuWatcherInForce {
  const handle = theGpuWatcherHandle()
  if (handle !== null) {
    const agent = agentByHandle(handle)
    return { from: 'the .env line', handle, agent: agent === null ? null : asChoice(agent) }
  }
  if (stored === null || stored.watcher === null) return { from: 'nobody named' }
  const row = readParticipant({ kind: 'agent', id: stored.watcher }) as RegisteredAgent | null
  const why = whyThisAgentCannotWatch(row)
  if (why === null && row !== null) return { from: 'set here', agent: asChoice(row) }
  return { from: 'set here, cannot watch', stored: stored.watcher, storedName: row?.name || row?.handle || stored.watcher, cannotBecause: why ?? 'not registered' }
}

/** The English sentence for a reading. The page says the same from the same word keys. */
function theSentence(inForce: TheGpuWatcherInForce): string {
  switch (inForce.from) {
    case 'the .env line':
      return inForce.agent === null
        ? sayInEnglish('gpuWatcher.inForce.envNoAgent', { who: inForce.handle })
        : sayInEnglish('gpuWatcher.inForce.env', { who: inForce.agent.name || inForce.agent.handle })
    case 'set here':
      return sayInEnglish('gpuWatcher.inForce.setHere', { who: inForce.agent.name || inForce.agent.handle })
    case 'set here, cannot watch':
      return inForce.cannotBecause === 'retired'
        ? sayInEnglish('gpuWatcher.inForce.setHereRetired', { who: inForce.storedName })
        : sayInEnglish('gpuWatcher.inForce.setHereNotRegistered', { who: inForce.storedName })
    case 'nobody named':
      return sayInEnglish('gpuWatcher.inForce.nobody')
  }
}

/** WHO IS THE GPU WATCHER NOW, OR WHY NOBODY IS, with what the panel offers. The one reader. */
export function theGpuWatcher(): TheGpuWatcher {
  const stored = theStoredChoice()
  const inForce = theGpuWatcherInForce(stored)
  return {
    inForce,
    stored: stored?.watcher ?? null,
    everSet: stored !== null,
    because: stored?.because ?? null,
    says: theSentence(inForce),
    mayBeNamed: listParticipants().agents.filter((one) => !one.retired).map(asChoice),
  }
}

/** The agent that is the GPU watcher now, or null because nobody is. */
function theWatchingAgent(inForce: TheGpuWatcherInForce): AGpuWatcherChoice | null {
  if (inForce.from === 'the .env line' || inForce.from === 'set here') return inForce.agent
  return null
}

/** Whether the caller is the GPU watcher: an agent, and the one the reading names. */
export function isTheGpuWatcher(actor: Actor): boolean {
  if (actor.type !== 'agent') return false
  const watcher = theWatchingAgent(theGpuWatcherInForce(theStoredChoice()))
  if (watcher === null) return false
  const me = participantForActor(actor)
  return me !== null && me.id === watcher.id
}

/**
 * THE REFUSAL TO A CALLER WHO IS NEITHER THE WATCHER NOR THE OWNER, saying who may `does` in this office and, when
 * nobody is the watcher, how one is named.
 */
export function onlyTheGpuWatcherOrTheOwner(does: string): string {
  const inForce = theGpuWatcherInForce(theStoredChoice())
  switch (inForce.from) {
    case 'the .env line':
      return `Only the GPU watcher (the agent ${inForce.handle}, which MOLE_OFFICE_GPU_WATCHER names) or the owner ${does}. Nothing was written.`
    case 'set here':
      return `Only the GPU watcher (the agent ${inForce.agent.handle}, named in this office's settings) or the owner ${does}. Nothing was written.`
    case 'set here, cannot watch':
      return (
        `Only the owner ${does}: the GPU watcher named in this office's settings, ${inForce.storedName}, ` +
        `${inForce.cannotBecause === 'retired' ? 'is retired' : 'is not a registered agent here'}. ` +
        `${HOW_TO_NAME_THE_GPU_WATCHER} Nothing was written.`
      )
    case 'nobody named':
      return `Only the owner ${does}: no agent is the GPU watcher in this office. ${HOW_TO_NAME_THE_GPU_WATCHER} Nothing was written.`
  }
}

/**
 * SET THE GPU WATCHER, OR SET NOBODY, AND ANSWER WITH THE READING.
 *
 * `id` is a registry id the caller already resolved, or null for nobody. The door has already checked who is asking
 * and whether a reason is needed. An agent that cannot watch now is refused before anything is written. The change is
 * written as `actor`'s, under `workspaceId`, the project the press was made from.
 */
export function setTheGpuWatcher(actor: Actor, id: string | null, because: string | null, workspaceId: string): TheGpuWatcher {
  if (id !== null) {
    const row = readParticipant({ kind: 'agent', id }) as RegisteredAgent | null
    const why = whyThisAgentCannotWatch(row)
    if (why !== null) {
      const name = row?.name || row?.handle || id
      throw new PanelError(
        `${why === 'retired' ? `${name} is retired` : `"${name}" is not a registered agent here`}, so it cannot be the ` +
          'GPU watcher. GET /api/office/gpu-watcher lists the agents that may. Nothing was changed.',
        400,
      )
    }
  }
  const before = theStoredChoice()
  writeDownASettingChange(actor, { setting: GPU_WATCHER_SETTING, field: THE_FIELD, before, after: { watcher: id, because }, workspaceId })
  return theGpuWatcher()
}

/** "1 reading", "2 readings". */
function readings(n: number): string {
  return `${String(n)} ${n === 1 ? 'reading' : 'readings'}`
}

/**
 * THE STEP AT START: TAKE THE GPU WATCHER FROM THE READINGS THIS OFFICE ACCEPTED, ONCE, and answer with the line the
 * start logs.
 *
 * Asked only when the .env line names nobody and nobody has ever set the setting. A reading the office answered with
 * a 2xx was accepted from the watcher under the rule then in force, so every agent that handed one in was the watcher
 * then. The request log keeps the agent's id or handle as the caller sent it; each is read back to one agent. When
 * every accepted reading from an agent reads back to one live agent, that agent is written as the watcher, by the
 * office, with the reason. When none, two or more, a retired one, or a caller that reads back to no single agent
 * handed them in, nothing is written: the office does not choose between them.
 *
 * WHY `actor_type` MAY BE READ HERE. The request log keeps what the caller said it was, and that column is not used to
 * count calls. A reading answered 2xx is different: the door accepted it only from the owner or from an agent that
 * passed the watcher check, so an accepted reading from an agent was checked as one. A reading is stored one row each,
 * never counted by the hour, and `api_calls_operation_idx` finds them without reading the whole table.
 */
export function takeTheGpuWatcherFromItsReadings(): string {
  const handle = theGpuWatcherHandle()
  if (handle !== null) return `The GPU watcher is the agent ${handle}, which MOLE_OFFICE_GPU_WATCHER names. The setting was not changed.`
  if (theLastChangeOfASetting(GPU_WATCHER_SETTING) !== null) return 'The GPU watcher is set in this office already. It was not changed.'
  const callers = sqlite
    .prepare(
      `SELECT actor_id AS actorId, count(*) AS accepted, min(at_ms) AS firstMs, max(at_ms) AS lastMs
         FROM api_calls
        WHERE operation = 'booking.reading' AND status BETWEEN 200 AND 299 AND actor_type = 'agent' AND actor_id IS NOT NULL
        GROUP BY actor_id`,
    )
    .all() as { actorId: string; accepted: number; firstMs: number; lastMs: number }[]
  const byAgent = new Map<string, { agent: AgentIdentity; accepted: number; firstMs: number; lastMs: number }>()
  const nobodySingle: string[] = []
  for (const caller of callers) {
    const agent = theOneAgentAStringNames(sqlite, caller.actorId)
    if (agent === null) {
      nobodySingle.push(caller.actorId)
      continue
    }
    const was = byAgent.get(agent.id)
    byAgent.set(agent.id, {
      agent,
      accepted: (was?.accepted ?? 0) + caller.accepted,
      firstMs: Math.min(was?.firstMs ?? caller.firstMs, caller.firstMs),
      lastMs: Math.max(was?.lastMs ?? caller.lastMs, caller.lastMs),
    })
  }
  const nobody = `No GPU watcher was set. ${HOW_TO_NAME_THE_GPU_WATCHER}`
  if (nobodySingle.length > 0) {
    return `This office accepted readings of the GPU card from ${nobodySingle.map((one) => `"${one}"`).join(', ')}, which no single agent here answers to. ${nobody}`
  }
  if (byAgent.size === 0) return `This office has accepted no reading of the GPU card from an agent. ${nobody}`
  if (byAgent.size > 1) {
    const who = [...byAgent.values()].map((one) => one.agent.handle).join(', ')
    return `This office accepted readings of the GPU card from ${String(byAgent.size)} agents (${who}), so it did not choose between them. ${nobody}`
  }
  const [one] = [...byAgent.values()]
  if (one === undefined) throw new Error('A map of one agent held none.')
  if (one.agent.retired) {
    return `The one agent this office accepted readings of the GPU card from, ${one.agent.handle}, is retired. ${nobody}`
  }
  const because =
    `Set by the office when it started: this office had accepted ${readings(one.accepted)} of the GPU card from this ` +
    `agent, the first at ${localStamp(new Date(one.firstMs))} and the last at ${localStamp(new Date(one.lastMs))}, ` +
    'and none from any other agent.'
  writeDownASettingChange(theOffice(), {
    setting: GPU_WATCHER_SETTING,
    field: THE_FIELD,
    before: null,
    after: { watcher: one.agent.id, because } satisfies AStoredChoice,
    workspaceId: null,
  })
  return `The GPU watcher is now ${one.agent.handle}. ${because}`
}
