// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WRITE'S SESSION HEADER IS BOUND TO THE KEY IT CARRIES. Problem TwH5ICyRxLVd, round 63, with the conditions the secretary and
 * the GPU watcher set.
 *
 * Before this, x-mole-office-session was taken as said on every write. A change row names the run that wrote it, so any
 * key could file its work under another agent's run, and the run's spend and history then counted it.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * A write that carries a key may name a run in x-mole-office-session only when the key holds that run:
 *
 *   1. A RUN KEY HOLDS THE RUN IT IS BOUND TO, read from the binding's own revisions by `theRunThisRunKeyIsBoundTo` in
 *      lib/keys.ts and never from `data.extra.runKeyId`, which a patch may copy. A terminal's reopen binds a new key, and
 *      from then on the old one holds nothing. A finished or sealed run's own key still holds its own run for the acts
 *      after its end that lib/keys.ts lets it do, and no other run.
 *   2. A RUN KEY ACTING FOR A RUN ITS HOLDER STARTED holds that run (lib/acting-for.ts has checked it already).
 *   3. AN AGENT'S OWN KEY holds a running session that serves the agent, or ran as it (`ranAs`), or that the same agent
 *      filed for itself with a key of its own and that names no other agent. The last is the session hook's filing,
 *      which names no agent at all. It is read from the session's first revision, so it holds after the agent's key is
 *      replaced, and a session another agent or the office filed is not the agent's. One filing by the office is the
 *      agent's: the office's own key filed it under the agent's name, and its first revision says `heldByItsFiler`
 *      (./held-by-its-filer.ts). That is the session hook's filing when it knows the agent and not the agent's key. A
 *      session discovery filed in the agent's name, from a transcript it found on this computer, is not the agent's:
 *      the agent asked for a sweep and did not name that conversation. Its first revision's stamp says so.
 *   4. A DISPATCHED RUN'S KEY (the one `agent_runs.request.agentKeyId` names) HOLDS THE SESSION ITS WORKER FILED FOR IT:
 *      the newest session whose first revision the office's key proved and whose `extra.agentRun` names that run, as
 *      tools/agent-worker.mjs files it after its claim, while the run is claimed or running. A newer filing for the
 *      same run takes the key from the older one. Nothing is stored for this: the first revisions say it, read through
 *      the index of migration 0277. A deleted session is refused, as it is for a run key.
 *
 * The office's key, the person's key file and the person's own device and tool keys are taken as given
 * (`theKeyOnThisRequestIsTakenAsGiven` in lib/keys.ts). A visitor's credential is an agent's key here. Any other key is
 * refused. A request with no key is not this file's question; `actorFrom` in lib/http.ts refuses its session header
 * only at a door to a key.
 */

import type { FastifyRequest } from 'fastify'
import { stateWord } from '@shared/words.ts'
import { sqlite } from '../db/client.ts'
import { theKeyProvedTheRowsOwnWriter, theOneAgentAStringNames } from './agent-references.ts'
import {
  howThisRequestProvedItself,
  theKeyOnThisRequestIsTakenAsGiven,
  theRunThisRunKeyIsBoundTo,
} from './keys.ts'
import { theHashOfTheKeyOnThisRequest, theHeldKeyRowWhoseHashIs, whatTheKeyWithThisIdIsFor } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import type { EmbassyKey } from '@shared/worlds.ts'
import { HELD_BY_ITS_FILER } from './held-by-its-filer.ts'
import { everyAgentASessionsDataNames } from './messages.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'
import { discoveryFiledItInACallersName, holdsADiscoveryStamp } from '@shared/discovery-stamp.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'

/** What the key a write carries makes of the run its session header names. */
export type WhatTheKeyMakesOfTheRunNamed =
  | { is: 'no-key' }
  | { is: 'held' }
  | { is: 'not-held'; because: string }

const HOLDS: WhatTheKeyMakesOfTheRunNamed = { is: 'held' }
const NO_KEY: WhatTheKeyMakesOfTheRunNamed = { is: 'no-key' }
const refused = (because: string): WhatTheKeyMakesOfTheRunNamed => ({ is: 'not-held', because })

/** A session record as this file reads it. */
export type ARunNamed = { id: string; data: Record<string, unknown>; deleted: boolean }

// ============================================================================ the reminder

/** Two runs of one agent: the run whose key wrote, and the run it wrote. */
export interface ARunKeyReminder {
  keyRun: string
  writtenRun: string
}

/**
 * THE SENTENCE A WRITE'S ANSWER CARRIES when a run's key wrote another run of the same agent. It names both runs and
 * says what a session header would have shown: that the key holds the first, not the second. The requirement of
 * 8 November 2026 places this as a reminder on a write the office already takes, not a refusal.
 */
export function theRunKeyReminderSentence(reminder: ARunKeyReminder): string {
  return (
    `This write used the key of run ${reminder.keyRun} to write run ${reminder.writtenRun}; ` +
    `a session header naming run ${reminder.writtenRun} would make this plain, because this key is the run key of ` +
    `run ${reminder.keyRun}, not of that run.`
  )
}

/** The start of the one line the written run carries for this pair, so the line is found again and not written twice. */
export function theRunKeyNoticeStarts(keyRun: string): string {
  return `Run ${keyRun}'s key wrote this run at `
}

/** THE ONE LINE THE WRITTEN RUN'S HISTORY CARRIES: which run's key wrote it, when, and which run it wrote. */
export function theRunKeyNoticeLine(reminder: ARunKeyReminder & { at: string }): string {
  return (
    `${theRunKeyNoticeStarts(reminder.keyRun)}${reminder.at}. ` +
    `A session header naming run ${reminder.writtenRun} would make this plain.`
  )
}

/**
 * WHETHER THE WRITTEN RUN ALREADY CARRIES THE LINE FOR THIS PAIR. One line for the pair, however many times the same
 * key's run writes the same run. The prefix is compared with `substr` rather than ILIKE, because an agent id may hold
 * `_`, which a LIKE would read as a wildcard.
 */
export function aRunKeyNoticeIsAlreadyOn(writtenRun: string, keyRun: string): boolean {
  const starts = theRunKeyNoticeStarts(keyRun)
  return (
    sqlite
      .prepare('SELECT 1 AS one FROM revisions WHERE record_id = ? AND note IS NOT NULL AND substr(note, 1, ?) = ? LIMIT 1')
      .get(writtenRun, starts.length, starts) !== undefined
  )
}

/**
 * The session record a header names: its id, or a run name bound to it in this project. Never its title. The run's
 * sandbox rule reads the session a write came from with it too (`assertMayWriteASandbox` in lib/records/may-write.ts).
 */
export function theRunTheHeaderNames(session: string, workspaceId: string): ARunNamed | { because: string } {
  const read = (id: string): ARunNamed | undefined => {
    const row = sqlite.prepare("SELECT id, data, deleted_at FROM records WHERE id = ? AND kind = 'session'").get(id) as
      | { id: string; data: string; deleted_at: string | null }
      | undefined
    return row === undefined ? undefined : { id: row.id, data: JSON.parse(row.data) as Record<string, unknown>, deleted: row.deleted_at !== null }
  }
  const byId = read(session)
  if (byId !== undefined) return byId
  const ref = resolveSessionRef(session, workspaceId)
  const byName = ref.matchedBy === 'name' && ref.recordId !== null ? read(ref.recordId) : undefined
  if (byName !== undefined) return byName
  if (ref.matchedBy === 'title') {
    return { because: "that is only a run's title, and with a key a run is named by its session record's id or a run name bound to it" }
  }
  return { because: 'no run of that name or id is filed in this office' }
}

/**
 * WHETHER THE SESSION'S FIRST REVISION IS THE AGENT'S OWN FILING: written under the agent's name and proved by an agent's
 * key that proved that same agent. `proved_holder` is null where the key proved the very name the headers gave, and
 * names the key's holder otherwise, as a run key acting for a subagent does, and as the create of a run a starter files
 * by hand does; then the holder must be the agent too (`theKeyProvedTheRowsOwnWriter`).
 * Or written under the agent's name by the office's own key, with `heldByItsFiler` in that revision's data. Only the
 * first revision is read, so no later write can make a session the agent's. A run discovery filed in the agent's name
 * passes here, and `theAgentsWhoseOwnRunThisIs` below leaves it out, so this is asked only there.
 */
function theAgentFiledItForItself(run: string, agentId: string): boolean {
  const first = sqlite.prepare('SELECT actor_type, actor_id, proved_by, proved_holder, data FROM revisions WHERE record_id = ? AND seq = 1').get(run) as
    | { actor_type: string; actor_id: string; proved_by: string | null; proved_holder: string | null; data: string }
    | undefined
  if (first === undefined || first.actor_type !== 'agent') return false
  if (theOneAgentAStringNames(sqlite, first.actor_id)?.id !== agentId) return false
  if (first.proved_by === 'the-office-key') return (JSON.parse(first.data) as Record<string, unknown>)[HELD_BY_ITS_FILER] === true
  if (first.proved_by !== 'an-agent-key') return false
  // The holder and `proved_by` come from one proof (`actorFrom` in lib/http.ts), so the holder here came from an agent's
  // key, and the writer was read above as the agent.
  return first.proved_holder === null ||
    theKeyProvedTheRowsOwnWriter(sqlite, { type: first.actor_type, id: first.actor_id }, JSON.parse(first.proved_holder))
}

/**
 * WHETHER DISCOVERY FILED THE RUN IN A CALLER'S NAME, as the data of the run's first revision says. Discovery's stamp
 * says so where discovery wrote its mark (`discoveryFiledItInACallersName` in lib/sessions.ts). The runs it filed before
 * it wrote the mark carry none, and they are known by a stamp with no `providerSession` beside it: discovery never
 * writes that field, and the session hook writes it from the conversation's id whenever it writes a stamp.
 */
function discoveryFiledItAsItsFirstRevisionSays(first: Record<string, unknown>): boolean {
  if (discoveryFiledItInACallersName(first)) return true
  const conversation = first['providerSession']
  return holdsADiscoveryStamp(first) && !(typeof conversation === 'string' && conversation !== '')
}

/** Where a run stands, for a sentence: deleted, ended, or nobody can say it is running. Null while it runs. */
function whyTheRunIsNotRunning(run: Omit<ARunNamed, 'id'>): string | null {
  if (run.deleted) return "that run's session record is deleted"
  const state = run.data['state']
  if (typeof state !== 'string' || state === 'unknown') return 'nobody can say that run is still running, because its record holds no state the office can read'
  return theRunHasEnded(state) ? `that run has ended (its state is "${stateWord(state).text}")` : null
}

/**
 * `json_extract(data, '$.extra.agentRun')`, in the words of the index of migration 0277, which holds first revisions
 * only. A read uses that index only when it asks in these words and says `seq = 1` with the literal value.
 */
const THE_DISPATCHED_RUN_NAMED = theWordsOfAStoredField(STORED_FIELDS.agentRun, 'data')

/**
 * THE FOURTH PART OF THE RULE AT THE TOP OF THIS FILE: why a dispatched run's key does not hold this session, or null
 * when it does. The session is not deleted, the run is claimed or running, the session's first revision was proved by
 * the office's key and names the run in `extra.agentRun`, and no later first revision does the same for that run.
 */
function whyADispatchedRunsKeyDoesNotHold(run: EmbassyKey['of'], named: ARunNamed): string | null {
  if (run === null) return 'nobody can say which dispatched run this key was made for'
  if (named.deleted) return "that run's session record is deleted"
  if (run.state !== 'not-ended') return `this key is the key of dispatched run ${run.id}, which is not claimed or running`
  const filedFor = (id: string): boolean =>
    sqlite
      .prepare(
        'SELECT 1 AS one FROM revisions WHERE record_id = ? AND seq = 1 ' +
          `AND ${THE_DISPATCHED_RUN_NAMED} = ? AND op = 'create' AND proved_by = 'the-office-key'`,
      )
      .get(id, run.id) !== undefined
  if (!filedFor(named.id)) {
    return `this key is the key of dispatched run ${run.id}, and the office's key did not file that session for that run`
  }
  // THE NEWEST FILING FOR THE RUN, by the order the revisions were written.
  const newest = sqlite
    .prepare(
      `SELECT record_id AS id FROM revisions WHERE seq = 1 AND ${THE_DISPATCHED_RUN_NAMED} = ? ` +
        "AND kind = 'session' AND op = 'create' AND proved_by = 'the-office-key' ORDER BY rowid DESC LIMIT 1",
    )
    .get(run.id) as { id: string } | undefined
  if (newest !== undefined && newest.id !== named.id) {
    return `this key is the key of dispatched run ${run.id}, and a newer session the office's key filed for that run, ${newest.id}, holds it now`
  }
  return null
}

/**
 * WHAT THE KEY THIS WRITE CARRIES MAKES OF THE RUN ITS SESSION HEADER NAMES, by the rule at the top of this file.
 * `no-key` where the request carries no key, carries one this office does not hold, or carries a live one a test world
 * does not trust: each of those proves nobody, and the request is judged as one with no key.
 */
export function whatTheKeyMakesOfTheRunNamed(req: FastifyRequest, session: string, workspaceId: string): WhatTheKeyMakesOfTheRunNamed {
  const hash = theHashOfTheKeyOnThisRequest(req)
  if (hash === null) return NO_KEY
  if (theKeyOnThisRequestIsTakenAsGiven(req)) return HOLDS
  const proof = howThisRequestProvedItself(req)
  if (proof?.actingFor !== undefined) return HOLDS
  const row = theHeldKeyRowWhoseHashIs(hash)
  if (row === null || (proof === undefined && row.revokedAt === null)) return NO_KEY
  const named = theRunTheHeaderNames(session, workspaceId)
  if ('because' in named) return refused(named.because)

  const bound = theRunThisRunKeyIsBoundTo(row.id)
  if (bound !== undefined) {
    if (bound.run !== named.id) return refused(`this key is the run key of run ${bound.run}, not of that run`)
    if (!bound.newest) return refused('this key was the run key of that run until the run was opened again, when a new key replaced it')
    // A FINISHED OR SEALED RUN'S OWN KEY, on the acts after its end lib/keys.ts admits it to, and on its own run only.
    if (proof?.sealedRun === named.id || proof?.finishedRun === named.id) return HOLDS
    if (row.revokedAt !== null) return refused('this key has been revoked')
    const stands = whyTheRunIsNotRunning(named)
    return stands === null ? HOLDS : refused(stands)
  }

  if (row.revokedAt !== null) return refused('this key has been revoked')
  const madeFor = whatTheKeyWithThisIdIsFor(row.id)
  if (madeFor.is === 'a-dispatched-run') {
    const why = whyADispatchedRunsKeyDoesNotHold(madeFor.of, named)
    return why === null ? HOLDS : refused(why)
  }
  if (madeFor.is === 'a-run' || madeFor.is === 'a-deleted-run') {
    return refused("this key was made for a run, and no binding the office wrote ties it to that run or to any other")
  }
  // AN AGENT'S OWN KEY, AND A WORLD'S REPORTING KEY, WHICH IS ITS HOLDER'S.
  const holder = row.whoseKind === 'agent' ? theOneAgentAStringNames(sqlite, row.whoseId) : null
  if (holder === null) return refused('this key is held by no one agent this office holds')
  const why = whyAnAgentsOwnKeyDoesNotHold({ id: holder.id, handle: holder.handle }, named)
  return why === null ? HOLDS : refused(why)
}

/**
 * THE RUN'S OWN AGENTS, by registry id: the agent it serves and every agent it ran as (`ranAs`). The third part of the
 * rule at the top of this file asks it, and so do the rule on who may end a run (`mayEndARun` in lib/records/may-write.ts) and
 * the door that stops a run that will not stop (src/server/api/runtime.ts). One reading, so the three cannot come to
 * disagree about whose run it is.
 */
export function theRunsOwnAgents(data: Record<string, unknown>): string[] {
  const serving = theAgentARunServes(data)?.id
  const ranAs = everyAgentASessionsDataNames({ ranAs: data['ranAs'] }).map((one) => one.id)
  return serving === undefined ? ranAs : [serving, ...ranAs.filter((id) => id !== serving)]
}

/**
 * THE AGENTS WHOSE OWN RUN THIS IS, by registry id, whether it runs or not: its own agents (`theRunsOwnAgents`), and the
 * agent that filed it for itself where it names no other agent. A run discovery filed in the agent's name is not one
 * the agent filed for itself, as its first revision says (`discoveryFiledItAsItsFirstRevisionSays` above).
 * The third part of the rule at the top of this file asks it of a running run, and the create door and the patch door
 * ask it of every run that names a conversation a write gives a run (`assertARunCarriesNoOtherAgentsConversation` in
 * lib/records/may-write.ts). A profile's resume line asks it of a run that names no serving agent (lib/session-origins.ts), and
 * that reading gives no holding. One reading, so they cannot disagree.
 */
export function theAgentsWhoseOwnRunThisIs(run: ARunNamed): string[] {
  const own = theRunsOwnAgents(run.data)
  const first = sqlite.prepare('SELECT actor_type, actor_id, data FROM revisions WHERE record_id = ? AND seq = 1').get(run.id) as
    | { actor_type: string; actor_id: string; data: string }
    | undefined
  const filer = first?.actor_type === 'agent' ? theOneAgentAStringNames(sqlite, first.actor_id)?.id : undefined
  if (first === undefined || filer === undefined || own.includes(filer)) return own
  if (discoveryFiledItAsItsFirstRevisionSays(JSON.parse(first.data) as Record<string, unknown>)) return own
  const forItself = theAgentFiledItForItself(run.id, filer) && everyAgentASessionsDataNames(run.data).every((one) => one.id === filer)
  return forItself ? [...own, filer] : own
}

/**
 * THE THIRD PART OF THE RULE AT THE TOP OF THIS FILE: why an agent's own key does not hold this run, or null when it
 * does. The run must be running, and serve the agent, or have run as it, or be one the agent filed for itself that
 * names no other agent. The run's sandbox rule asks it of a host filing (`assertMayWriteASandbox` in lib/records/may-write.ts).
 */
export function whyAnAgentsOwnKeyDoesNotHold(holder: { id: string; handle: string }, named: ARunNamed): string | null {
  const stands = whyTheRunIsNotRunning(named)
  if (stands !== null) return stands
  if (theAgentsWhoseOwnRunThisIs(named).includes(holder.id)) return null
  return `that run does not serve "${holder.handle}", did not run as it, and is not a run it filed for itself that serves no other agent`
}
