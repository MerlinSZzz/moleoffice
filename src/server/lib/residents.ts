// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { storedFileChanged, storedFileMoved, storedTreeRemoved } from './storage/store.ts'
/**
 * PERMANENT RESIDENTS, AND THE PERSONAL SPACE EACH ONE HAS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DECIDED, AND WHERE
 * ---------------------------------------------------------------------------------------
 *
 * A decision says: a resident's memory is earned by time; the secretary nominates and the owner confirms with one
 * press; it hangs on the agent's lasting id, is kept in the office and backed up; the personal space is a folder of any
 * files, at most 500 MB, a setting; the agent writes its own; the owner reads all of it; no other agent changes it, and
 * no other agent reads it without the agent's leave; a wrong entry is marked void with the reason, never deleted; after
 * retirement it is kept, and the successor may read it. Items 2 and 5 of a decision add that
 * the space is made at once, and that each one is called as its own address field says. The
 * proposal GsGFiDygATd5 asked eight questions of how to build it, and all eight were agreed as a decision
 * recommends, adding the session-origin file (src/server/lib/session-origins.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE SPACE IS, AND WHAT THE OFFICE CAN HONESTLY ENFORCE
 * ---------------------------------------------------------------------------------------
 *
 * `personal-spaces/<agent id>/` beside the database, as `returned-files/` is (src/server/lib/returnedfiles.ts),
 * for the reason that file gives: bytes belong to the database that points at them, and a scratch stack on a
 * copy must not write into the owner's own folder. It is reached only through the doors in
 * src/server/api/residents.ts, and every read and write through them is checked and recorded.
 *
 * WHAT IT CANNOT STOP: a program on this machine that reads the folder by its path. The office never hands that
 * path to another agent, and every reply about a space says this limit in `notes` (answer 1).
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY DO WHAT
 * ---------------------------------------------------------------------------------------
 *
 *   propose        an agent holding the secretary card, not retired, with its own key (`theKeyProvesASecretary`).
 *   confirm        the person only, with a proved request. A raise does NOT carry it: one secretary could
 *                  otherwise propose and confirm, and the check the decision asks for would be gone.
 *   decline        the person, or a secretary under the person's raise: an ordinary act of theirs.
 *   read           the resident with its own key, the person, an agent holding a live grant (until the resident
 *                  is retired), and the successor the person named once the resident is retired.
 *   write a file   the resident with its own key, while it is not retired. Nobody else, ever.
 *   mark void      the resident with its own key, or the person.
 *   give leave     the resident with its own key, while it is not retired.
 *   end leave      the resident with its own key, or the person.
 *   successor      the person, or a secretary under the person's raise, once the resident is retired, and once.
 *   sleep, wake    the resident with its own key, or the person. A retired resident is not put to sleep.
 *   postpone       the resident with its own key only. It is written on the resident and sent to nobody.
 *   sleep time     the resident with its own key, or the person, for a resident that holds the secretary card and is
 *                  not retired (each secretary sets its own).
 *   named          the resident with its own key, or the person: the picture and the name are chosen.
 *
 * A request that names an agent in its headers and carries no key proves nothing here, as everywhere.
 *
 * ---------------------------------------------------------------------------------------
 * A FILE MAY BE REPLACED, AND ITS EARLIER VERSION IS KEPT
 * ---------------------------------------------------------------------------------------
 *
 * The resident keeps its memory short and tidies it, because it is read at every start, as item 7 of a decision
 * says, so a path may be written again. Nothing in a space is ever deleted all the same:
 * before a file is replaced, the office moves its old bytes to `.versions/<path>/<n>` in the same space, where n
 * counts from 1, and the write row names that path. The folder is reserved: nobody writes into it or removes
 * anything from it.
 *
 * WHY A FOLDER IN THE SPACE AND NOT ROWS. The backup already carries the whole of `personal-spaces/`, outside the
 * 10 GB line on new bytes, so a version kept there is backed up with no new rule; bytes in a table would make the database grow by
 * up to the space's limit per resident, which is what answer 1 of the proposal turned down.
 *
 * Earlier versions count against the limit, as every byte in the space does. A void mark follows the bytes it was
 * about: when a void file is replaced, its mark moves to the earlier version, and no mark is ever taken off.
 *
 * EVERY DOOR VALIDATES EVERYTHING BEFORE IT WRITES ANYTHING (problem HeqtGKcycLvq).
 */

import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { anOfficeId } from './ids.ts'

import { settings, settingValue } from '../../config/settings.mjs'
import { THE_MAIL_TOOL_HANDLE } from '../../config/the-mail-tool.mjs'
import { sqlite } from '../db/client.ts'
import { theStampsOf } from './registry-aliases/stamps.ts'
import { localStamp, nowStamp, parseLocalStamp, readATypedTime } from '@shared/time.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import {
  type RegisteredAgent,
} from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { theAgentTheKeyProves } from './the-agent-the-key-proves.ts'
import { theKeyProvesASecretary } from './the-key-proves-a-secretary.ts'
import { readParticipant } from '../db/read-participant.ts'
import {
  RESOLVES_PROPOSAL,
  aRaiseCarriesIt,
  assertThePersonIsProved,
  createRecord,
  createRecordWithReport,
  getRecord,
  proposalResolution,
  writeDownAnActUnderTheRaise,
  type Actor,
} from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { theWorldThisDatabaseIs } from './world.ts'
import { SESSION_ORIGINS_FILE, bringTheOriginsUpToDate, theSessionsOfTheAgent, writeTheFirstOrigin } from './session-origins.ts'
import type { PanelRecord } from '@shared/types.ts'
import {
  PERSONAL_SPACE_DIRECTORY,
  RESIDENCY_EXTRA_KEY,
  SLEEP_TIME_LONGEST_MINUTES,
  SLEEP_TIME_SHORTEST_MINUTES,
  measuredAgainstTheCriterion,
  type TheCriterionReading,
} from '@shared/residents.ts'
import { compactionsThisRunReported } from './agent-runs.ts'
import { whileTheResidentsDoorsSettle } from './residents-door.ts'
import { endTheOpenSleep, theOpenSleepOf, theSleepOf, writeASleepRow, writeTheSleepTime, type ASleepTime, type TheSleepReading } from './resident-sleep.ts'
import { holdsTheSecretaryCard } from './holds-the-secretary-card.ts'
import { everythingWaitingFor, theNewestHoldOn } from './handles.ts'
import { handleLapsesAfterSeconds } from './env.ts'
import { tellTheWaitersFor } from './waiting-hold.ts'
import { writeASystemLineToOne } from './groups.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { isMoleOffice, moleOffice } from '@shared/participants.ts'
import { HOLD, type HoldState } from '@shared/handles.ts'
import { named } from './named-timers.ts'

// ============================================================================ where the spaces are

/** The folder every personal space is in: `personal-spaces/`, beside the database. Named once, in src/shared/residents.ts. */
export { PERSONAL_SPACE_DIRECTORY }

/** Where the spaces go on this machine, as an absolute path. Never handed to an agent. */
export function personalSpacesDirectory(): string {
  return join(dirname(resolve(settings().databasePath)), PERSONAL_SPACE_DIRECTORY)
}

/**
 * One resident's space. The id is a registry id, which is letters, digits, `_` and `-` (a nanoid, or a handle for
 * an agent registered before ids); anything else is refused, so an id can never reach outside the folder.
 */
export function theSpaceOf(agentId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(agentId)) {
    throw new PanelError(`"${agentId}" is not an agent id a space can be named after. Nothing was read or written.`, 400)
  }
  return join(personalSpacesDirectory(), agentId)
}

/**
 * THE LIMIT, from the one setting that says so. A setting that is there and is not a whole number of bytes is
 * refused rather than read as the default, for the reason `maxReturnedFileBytes` gives.
 */
export function maxPersonalSpaceBytes(): number {
  const said = settingValue('MOLE_OFFICE_PERSONAL_SPACE_MAX_BYTES')
  const n = Number(said)
  if (!Number.isInteger(n) || n <= 0) {
    throw new PanelError(
      `MOLE_OFFICE_PERSONAL_SPACE_MAX_BYTES is ${JSON.stringify(said)}, which is not a whole number of bytes. Set it to ` +
        'one, or take it out to use the built-in limit of 524288000. Nothing was written.',
      500,
    )
  }
  return n
}

/** What every reply about a space says about the one thing the office cannot stop (answer 1). */
export const WHAT_THE_OFFICE_CANNOT_STOP =
  'The space is a folder on the machine the office runs on, reached only through the office’s doors, and every read ' +
  'and write through them is checked and recorded. A program running on that machine could still read the folder ' +
  'by its path; the office never gives that path to another agent.'

// ============================================================================ who is asking

/** The caller as the residents' doors read it: the person proved, an agent its own key proves, or nobody. */
export type TheCaller = { kind: 'person'; id: string } | { kind: 'agent'; id: string } | { kind: 'nobody' }

/** Who this request is, by proof only. A name in the headers with no key is nobody here. */
export function theCallerOf(actor: Actor): TheCaller {
  if (actor.type === 'human') return thePersonIsProved(actor) ? { kind: 'person', id: actor.id } : { kind: 'nobody' }
  if (actor.type !== 'agent' || actor.provedHolder !== undefined) return { kind: 'nobody' }
  const id = theAgentTheKeyProves(actor)
  return id === null ? { kind: 'nobody' } : { kind: 'agent', id }
}

/** The caller as a row stores it: who and of which kind. */
function theWriterOf(caller: TheCaller): ParticipantRef {
  if (caller.kind === 'nobody') throw new Error('A write was attributed to a caller nobody proved.')
  return { kind: caller.kind, id: caller.id }
}

// ============================================================================ residency

/** A resident as its row holds it. */
export interface Residency {
  agentId: string
  handle: string
  name: string
  since: string
  proposalId: string
  decisionId: string
  confirmedBy: ParticipantRef
  retired: boolean
  retiredAt: string | null
  successor: { agentId: string; handle: string | null; name: string | null; namedAt: string; namedBy: ParticipantRef } | null
  /**
   * THE PICTURE-AND-NAME REMINDER. `askedAt` is when the confirm press asked for them, or null
   * for a resident confirmed before migration 0233, which was never asked. `namedAt` and `namedBy` are written once,
   * by POST /api/residents/:agentId/named. The person's reminder waits while it was asked and is not settled.
   */
  naming: { askedAt: string | null; namedAt: string | null; namedBy: ParticipantRef | null }
}

function refOf(kind: unknown, id: unknown): ParticipantRef {
  return { kind: String(kind) as ParticipantRef['kind'], id: String(id) }
}

/** The residency of one agent by registry id, or null because it is not a resident. */
export function residencyOf(agentId: string): Residency | null {
  const row = sqlite.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Record<string, unknown> | undefined
  if (row === undefined || row['resident_since'] === null) return null
  const successorId = row['successor_id'] === null ? null : String(row['successor_id'])
  const successor = successorId === null ? null : (readParticipant({ kind: 'agent', id: successorId }) as RegisteredAgent | null)
  return {
    agentId: String(row['id']),
    handle: String(row['handle']),
    name: String(row['name']),
    since: String(row['resident_since']),
    proposalId: String(row['resident_proposal']),
    decisionId: String(row['resident_decision']),
    confirmedBy: refOf(row['resident_confirmed_by_kind'], row['resident_confirmed_by_id']),
    retired: row['retired'] === 1,
    retiredAt: row['retired_at'] === null ? null : String(row['retired_at']),
    successor:
      successorId === null
        ? null
        : {
            agentId: successorId,
            handle: successor?.handle ?? null,
            name: successor?.name ?? null,
            namedAt: String(row['successor_named_at']),
            namedBy: refOf(row['successor_named_by_kind'], row['successor_named_by_id']),
          },
    naming: {
      askedAt: row['resident_naming_asked_at'] === null ? null : String(row['resident_naming_asked_at']),
      namedAt: row['resident_named_at'] === null ? null : String(row['resident_named_at']),
      namedBy: row['resident_named_at'] === null ? null : refOf(row['resident_named_by_kind'], row['resident_named_by_id']),
    },
  }
}

/** Every resident, by when it became one. */
export function everyResident(): Residency[] {
  const ids = sqlite.prepare('SELECT id FROM agents WHERE resident_since IS NOT NULL ORDER BY resident_since, id').all() as { id: string }[]
  return ids.map((one) => residencyOf(one.id)).filter((one): one is Residency => one !== null)
}

/** The resident an arriving reference names, or a refusal saying it is not one. */
export function theResidentNamed(reference: string, doing: 'reading' | 'writing'): Residency {
  const named = theAgentAnArrivingReferenceNames(reference, doing)
  if (named === null) throw new PanelError(`No agent in this installation answers to "${reference}". Nothing was read or written.`, 404)
  const residency = residencyOf(named.agent.id)
  if (residency === null) {
    throw new PanelError(
      `${named.agent.handle} is not a permanent resident, so it has no personal space. Nothing was read or written. ` +
        'A secretary proposes a resident with POST /api/residents/proposals, and the owner confirms it.',
      404,
    )
  }
  return residency
}

// ============================================================================ the measured facts

/** What the office measured about an agent when a secretary proposed it (answer 3: no minimum, the person judges). */
export interface MeasuredFacts {
  measuredAt: string
  citizenSince: string | null
  /** Whole days from `citizenSince` to `measuredAt`, or null when nobody recorded when it became a citizen. */
  daysSinceCitizen: number | null
  /** How many different days a session serving it was filed on. */
  daysWithARun: number
  /** How many sessions serving it are on record. */
  runs: number
  /** How many records the change log says this agent created, by its id or by the handle only it bears. */
  recordsWritten: number
  retired: boolean
  homeWorld: string | null
  /**
   * HOW MANY COMPACTIONS THE RUNS SERVING IT REPORTED, from `data.compactions` on its session records, read with the one
   * reader in lib/agent-runs.ts. 0 means no run reported one, which is not the same as none happening. Absent on a
   * proposal filed before the office counted them.
   */
  compactionsReported?: number
}

/** How many compactions these session records reported, by the one reader in lib/agent-runs.ts. */
function compactionsIn(sessions: readonly { data: Record<string, unknown> }[]): number {
  return sessions.reduce((total, one) => total + compactionsThisRunReported(one.data).length, 0)
}

/** How many compactions the runs serving this agent reported, now. 0 is "none reported", not "none happened". */
export function compactionsReportedNow(agentId: string, handle: string): number {
  return compactionsIn(theSessionsOfTheAgent(agentId, handle))
}

/** The facts, measured now. */
export function measureTheAgent(agent: RegisteredAgent, now: Date = new Date()): MeasuredFacts {
  const measuredAt = localStamp(now)
  const since = agent.citizenSince === null ? null : parseLocalStamp(agent.citizenSince)
  const sessions = theSessionsOfTheAgent(agent.id, agent.handle)
  const days = new Set(sessions.map((one) => one.createdAt.slice(0, 10)))
  const compactionsReported = compactionsIn(sessions)
  // THE HANDLE COUNTS ONLY WHEN THIS AGENT IS THE ONE AGENT BEARING IT: a change row names its writer as the
  // request's headers did, which is a stored reference, and a handle another agent bore once is not this agent's.
  const handleIsOnlyItsOwn =
    (sqlite.prepare('SELECT count(*) AS n FROM agents WHERE handle = ? OR id = ?').get(agent.handle, agent.handle) as { n: number }).n === 1
  // And each old registry id filed for it that only it answers to.
  const names = theStampsOf(sqlite, agent.id, handleIsOnlyItsOwn && agent.handle !== agent.id ? [agent.id, agent.handle] : [agent.id])
  const written = sqlite
    .prepare(
      `SELECT count(*) AS n FROM changes WHERE op = 'create' AND actor_type = 'agent' AND actor_id IN (${names.map(() => '?').join(', ')})`,
    )
    .get(...names) as { n: number }
  return {
    measuredAt,
    citizenSince: agent.citizenSince,
    daysSinceCitizen: since === null ? null : Math.floor((now.getTime() - since) / 86_400_000),
    daysWithARun: days.size,
    runs: sessions.length,
    recordsWritten: written.n,
    retired: agent.retired,
    homeWorld: agent.homeWorld,
    compactionsReported,
  }
}

/** One part of the criterion in words: whether the facts meet it. */
function thePartInWords(part: TheCriterionReading['days']['part']): string {
  if (part === 'met') return 'met'
  if (part === 'not-met') return 'not met'
  if (part === 'not-reported') return 'not shown, because no compaction has been reported for its runs'
  return 'not measured, because the office did not count compactions when this was proposed'
}

/**
 * THE FACTS AGAINST THE DECIDED CRITERION, as sentences for the proposal's `evidence`. The office
 * says whether each part is met and refuses nothing: the person judges.
 */
function theCriterionInWords(reading: TheCriterionReading): string[] {
  return [
    `The decided criterion is three days of work and five compactions or more, and a long-term area of responsibility. ` +
      'The office shows whether each part is met; the person decides.',
    `Days with a run: ${String(reading.days.have)} of ${String(reading.days.needed)} needed, ${thePartInWords(reading.days.part)}.`,
    reading.compactions.have === null
      ? `Compactions: ${thePartInWords(reading.compactions.part)}.`
      : `Compactions reported: ${String(reading.compactions.have)} of ${String(reading.compactions.needed)} needed, ${thePartInWords(reading.compactions.part)}.`,
    reading.area.named === null ? 'No area of responsibility was named.' : `Area of responsibility: ${reading.area.named}.`,
  ]
}

/** The facts as sentences, for the proposal's `evidence`. */
function theFactsInWords(facts: MeasuredFacts, area: string | null): string[] {
  return [
    ...theCriterionInWords(measuredAgainstTheCriterion(facts, area)),
    facts.daysSinceCitizen === null
      ? 'Nobody recorded when it became a citizen.'
      : `It has been a citizen for ${String(facts.daysSinceCitizen)} day${facts.daysSinceCitizen === 1 ? '' : 's'}, since ${String(facts.citizenSince)}.`,
    `It has ${String(facts.runs)} run${facts.runs === 1 ? '' : 's'} on record, on ${String(facts.daysWithARun)} different day${facts.daysWithARun === 1 ? '' : 's'}.`,
    `The change log says it created ${String(facts.recordsWritten)} record${facts.recordsWritten === 1 ? '' : 's'}.`,
    facts.compactionsReported === undefined || facts.compactionsReported === 0
      ? 'No compaction has been reported for its runs.'
      : `Its runs reported ${String(facts.compactionsReported)} compaction${facts.compactionsReported === 1 ? '' : 's'}.`,
    facts.retired ? 'It is retired.' : 'It is not retired.',
    `Its home world is ${facts.homeWorld ?? 'not recorded'}.`,
    `Measured by the office at ${facts.measuredAt}.`,
  ]
}

// ============================================================================ who may be proposed

/** Why this agent may not be proposed, in a sentence, or null because it may. */
export function whyThisAgentMayNotBeProposed(agent: RegisteredAgent): string | null {
  const nothing = 'Nothing was written.'
  if (agent.handle === THE_MAIL_TOOL_HANDLE) {
    return `${agent.handle} is the person's mail tool, a tool set in their settings and not an agent, so it cannot be a resident. ${nothing}`
  }
  if (isMoleOffice({ kind: 'agent', id: agent.id })) {
    return `${agent.name} is the product writing its own lines, not an agent somebody runs, so it cannot be a resident. ${nothing}`
  }
  if (agent.retired) return `${agent.handle} is retired, and only an agent that is not retired may be proposed. ${nothing}`
  if (residencyOf(agent.id) !== null) return `${agent.handle} is already a permanent resident. ${nothing}`
  const here = theWorldThisDatabaseIs()
  if (here === null) {
    return `This office cannot say which world it is, so it cannot tell whether ${agent.handle} is one of its citizens. ${nothing}`
  }
  if (agent.homeWorld !== here) {
    return (
      `${agent.handle} is not a citizen of this office's world: its home world is ${agent.homeWorld ?? 'not recorded'}. ` +
      `Only a citizen of this world may be a resident here, and never an agent of a scratch or test world. ${nothing}`
    )
  }
  return null
}

// ============================================================================ proposals

/** The `extra` key a residency proposal carries, which is how the office finds its proposals. Named in src/shared/residents.ts. */
export { RESIDENCY_EXTRA_KEY }

/** What a residency proposal's `extra.residency` holds. */
interface WhatAProposalHolds {
  agentId: string
  facts: MeasuredFacts
  /** The long-term area of responsibility the proposal named, or null because it named none. */
  area: string | null
}

function whatAProposalHolds(record: Pick<PanelRecord, 'data'>): WhatAProposalHolds | null {
  const extra = record.data['extra']
  if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) return null
  const held = (extra as Record<string, unknown>)[RESIDENCY_EXTRA_KEY]
  if (typeof held !== 'object' || held === null || Array.isArray(held)) return null
  const agentId = (held as Record<string, unknown>)['agentId']
  const facts = (held as Record<string, unknown>)['facts']
  if (typeof agentId !== 'string' || typeof facts !== 'object' || facts === null) return null
  const area = (held as Record<string, unknown>)['area']
  return { agentId, facts: facts as MeasuredFacts, area: typeof area === 'string' && area.trim() !== '' ? area : null }
}

/** A residency proposal, as the doors answer about it. */
export interface AResidencyProposal {
  id: string
  workspaceId: string
  title: string
  agentId: string
  handle: string | null
  name: string | null
  proposedAt: string
  proposedBy: string | null
  because: string | null
  facts: MeasuredFacts
  /** The long-term area of responsibility the proposal named, or null because it named none. */
  area: string | null
  /** The facts against the decided criterion, from `measuredAgainstTheCriterion`, the one place it is worked out. */
  criterion: TheCriterionReading
  /** Open, or settled by the decision named. */
  settled: { decisionId: string; title: string } | null
}

function theProposerOf(proposalId: string): string | null {
  const row = sqlite
    .prepare("SELECT actor_id AS id FROM changes WHERE record_id = ? AND op = 'create' ORDER BY at LIMIT 1")
    .get(proposalId) as { id: string } | undefined
  return row?.id ?? null
}

/**
 * THE AGENT THAT FILED A RESIDENCY PROPOSAL, BY ITS REGISTRY ID, or null because there is no open proposal and no filer
 * on record. It reads without refusing a missing or settled proposal, so a caller with no grant still hears the person's
 * refusal before the door says the proposal is not there.
 *
 * The creation row keeps the name the caller sent, which may be its handle or its registry id. The check compares the
 * filer with the caller by registry id, so the filer is given here as the registry id.
 */
function theFilerOfAProposal(proposalId: string): string | null {
  const record = getRecord(proposalId)
  const proposal = record === null || record.deletedAt !== null || record.kind !== 'proposal' ? null : asAResidencyProposal(record)
  const stamped = proposal?.proposedBy ?? null
  if (stamped === null) return null
  return theAgentAnArrivingReferenceNames(stamped, 'reading')?.agent.id ?? stamped
}

function asAResidencyProposal(record: PanelRecord): AResidencyProposal | null {
  const held = whatAProposalHolds(record)
  if (held === null) return null
  const agent = readParticipant({ kind: 'agent', id: held.agentId }) as RegisteredAgent | null
  const resolution = proposalResolution(record)
  const settledBy = resolution?.by.find((one) => !one.deleted && one.replacedBy === null) ?? null
  const because = record.data['because']
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    title: record.title,
    agentId: held.agentId,
    handle: agent?.handle ?? null,
    name: agent?.name ?? null,
    proposedAt: record.createdAt,
    proposedBy: theProposerOf(record.id),
    because: typeof because === 'string' ? because : null,
    facts: held.facts,
    area: held.area,
    criterion: measuredAgainstTheCriterion(held.facts, held.area),
    settled: settledBy === null ? null : { decisionId: settledBy.id, title: settledBy.title },
  }
}

/** Every live residency proposal in every project, oldest first. */
export function everyResidencyProposal(): AResidencyProposal[] {
  const ids = sqlite
    .prepare(
      "SELECT id FROM records WHERE kind = 'proposal' AND deleted_at IS NULL AND " +
        `json_extract(data, '$.extra.${RESIDENCY_EXTRA_KEY}.agentId') IS NOT NULL ORDER BY created_at, rowid`,
    )
    .all() as { id: string }[]
  return ids
    .map((one) => getRecord(one.id))
    .filter((one): one is PanelRecord => one !== null)
    .map(asAResidencyProposal)
    .filter((one): one is AResidencyProposal => one !== null)
}

/** The open residency proposals. */
export function openResidencyProposals(): AResidencyProposal[] {
  return everyResidencyProposal().filter((one) => one.settled === null)
}

/** The option a residency proposal offers: one, which criterion PO1 allows. */
function theOptionFor(agent: RegisteredAgent): string {
  return `Make ${agent.name} (${agent.handle}) a permanent resident, with a personal space of its own.`
}

/** A secretary proposes an agent. Files a `proposal` record with the measured facts. */
export function proposeAResident(input: { agentId: string; because: string; area?: string }, actor: Actor, workspaceId: string): AResidencyProposal {
  if (!theKeyProvesASecretary(actor)) {
    throw new PanelError(
      'Only an agent holding the secretary card, not retired, proposes a permanent resident, and it proves who it is with ' +
        'its own key sent as x-mole-office-key. A name in the headers proves nothing. Nothing was written.',
      403,
    )
  }
  const because = input.because.trim()
  if (because === '') {
    throw new PanelError('Say why, in "because": the reason this agent should be a permanent resident, in your own words. Nothing was written.', 400)
  }
  const named = theAgentAnArrivingReferenceNames(input.agentId, 'writing')
  if (named === null) throw new PanelError(`No agent in this installation answers to "${input.agentId}". Nothing was written.`, 404)
  const agent = readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent
  const why = whyThisAgentMayNotBeProposed(agent)
  if (why !== null) throw new PanelError(why, 409)
  const open = openResidencyProposals().find((one) => one.agentId === agent.id)
  if (open !== undefined) {
    throw new PanelError(
      `${agent.handle} already has an open proposal, ${open.id} ("${open.title}"), and the owner has not answered it. ` +
        'Nothing was written. One open proposal per agent: wait for the answer.',
      409,
    )
  }
  const facts = measureTheAgent(agent)
  const area = input.area === undefined || input.area.trim() === '' ? null : input.area.trim()
  const option = theOptionFor(agent)
  const record = createRecord({
    kind: 'proposal',
    title: `Make ${agent.name} a permanent resident`,
    workspaceId,
    actor,
    data: {
      question: `Should ${agent.name} (${agent.handle}) become a permanent resident, with a personal space of its own?`,
      options: [option],
      recommendation: option,
      because,
      evidence: theFactsInWords(facts, area),
      who_settles_it: 'the owner',
      extra: { [RESIDENCY_EXTRA_KEY]: { agentId: agent.id, facts, ...(area === null ? {} : { area }) } },
    },
  })
  const made = asAResidencyProposal(record)
  if (made === null) throw new Error('A residency proposal was filed and reads back as no residency proposal.')
  return made
}

/** The open residency proposal a path names, or a refusal. */
function theOpenProposal(proposalId: string): { record: PanelRecord; proposal: AResidencyProposal } {
  const record = getRecord(proposalId)
  const proposal = record === null || record.deletedAt !== null || record.kind !== 'proposal' ? null : asAResidencyProposal(record)
  if (record === null || proposal === null) {
    throw new PanelError(`No open residency proposal has the id "${proposalId}". Nothing was written.`, 404, undefined, undefined, undefined, {
      code: 'residentNoSuchProposal',
      values: {},
    })
  }
  if (proposal.settled !== null) {
    throw new PanelError(
      `That proposal is already settled, by ${proposal.settled.decisionId} ("${proposal.settled.title}"). Nothing was written.`,
      409,
      undefined,
      undefined,
      undefined,
      { code: 'residentProposalSettled', values: {} },
    )
  }
  return { record, proposal }
}

/** What the confirm press did. */
export interface Confirmed {
  residency: Residency
  decision: PanelRecord
  /** The session the first line of the session-origin file was read from, or null when it has none. */
  firstOrigin: string | null
  /**
   * THE PICTURE-AND-NAME REMINDER, as it was written. The person's is the row of GET /api/waiting, written in the same
   * transaction as the residency, so it is there whenever the residency is. The agent's is one office line written
   * right after; if it could not be written, `agent.sent` is false with the reason, and `said` says so too.
   */
  reminder: { person: 'waiting'; agent: { sent: true; messageId: string } | { sent: false; why: string } }
  said: string
}

/**
 * THE PERSON CONFIRMS, OR A SECRETARY PRESSES THE PERSON'S ANSWER UNDER THEIR GRANT: one decision record settling the
 * proposal, the residency on the agent's row, and the space, in one act. If the folder cannot be made, nothing is
 * recorded and the answer says why.
 *
 * THE PERSON IS ASKED FIRST, THEN THE ONE CHECK WITH WHO FILED THE PROPOSAL, THEN THE OLD REFUSAL. A secretary the grant
 * carries the door for may confirm another secretary's proposal where this office's list says `may-press`. The check is
 * told the filer, so the card's `neverOnItsOwnFiling` refuses the secretary that proposed this one. Under the grant the
 * residency's confirmed-by fields name the secretary and the decision keeps `decided_by` "the owner", as declining does,
 * because the secretary presses the person's answer and does not become the person.
 *
 * THE ORDER. Everything is checked first. Then the folder is made and its first file written; if that fails,
 * nothing has been recorded. Then the decision and the row are written in one transaction; if that fails, the
 * folder this press made is taken away again, so no space is left without a resident. The folder is new and holds
 * only the file this press wrote, so taking it away deletes nothing anybody else wrote.
 */
export function confirmAResident(proposalId: string, actor: Actor): Confirmed {
  if (!thePersonIsProved(actor)) {
    if (!aRaiseCarriesIt(actor, { filedBy: theFilerOfAProposal(proposalId) })) {
      assertThePersonIsProved(actor, 'Confirming a permanent resident')
    }
  }
  const { record, proposal } = theOpenProposal(proposalId)
  const agent = readParticipant({ kind: 'agent', id: proposal.agentId }) as RegisteredAgent | null
  if (agent === null) throw new PanelError(`The agent this proposal names, ${proposal.agentId}, is no longer registered. Nothing was written.`, 409)
  const why = whyThisAgentMayNotBeProposed(agent)
  if (why !== null) {
    throw new PanelError(`This proposal can no longer be confirmed: ${why}`, 409, undefined, undefined, undefined, {
      code: 'residentNoLongerEligible',
      values: {},
    })
  }
  const by = participantForActor(actor) ?? { kind: 'person' as const, id: actor.id }
  const space = theSpaceOf(agent.id)
  if (existsSync(space)) {
    throw new PanelError(
      `A folder for ${agent.handle} is already there, and only the confirm press makes one. Nothing was recorded, and the ` +
        'folder was left as it is. Somebody has to look at what is in it before this agent can be confirmed.',
      409,
      undefined,
      undefined,
      undefined,
      { code: 'residentFolderAlreadyThere', values: {} },
    )
  }
  let firstOrigin: string | null
  // WHETHER THIS PRESS MADE THE FOLDER: only a folder it made is taken away again, and only then.
  let made = false
  try {
    // THE FOLDER OF ALL SPACES may be made here for the first resident; it holds nothing of anybody's on its own.
    mkdirSync(personalSpacesDirectory(), { recursive: true })
    mkdirSync(space)
    made = true
    firstOrigin = writeTheFirstOrigin(space, agent.id, agent.handle)
  } catch (err) {
    if (made) { rmSync(space, { recursive: true, force: true }); storedTreeRemoved(space) }
    throw new PanelError(
      `The personal space for ${agent.handle} could not be made (${err instanceof Error ? err.message : String(err)}), ` +
        'so nothing was recorded: the agent is not a resident and the proposal is still open.',
      500,
      undefined,
      undefined,
      undefined,
      { code: 'residentFolderNotMade', values: {} },
    )
  }
  const since = nowStamp()
  try {
    const decision = sqlite.transaction(() => {
      const created = whileTheResidentsDoorsSettle(() => createRecordWithReport({
        kind: 'decision',
        title: `${agent.name} is a permanent resident`,
        workspaceId: record.workspaceId,
        actor,
        data: {
          decided_by: 'the owner',
          option_taken: theOptionFor(agent),
          option_index: 0,
          replaces: [],
          why_it_replaces_none: 'A residency is a new standing for one agent, and no earlier decision made this one a resident.',
        },
        links: [{ type: RESOLVES_PROPOSAL, toId: record.id }],
        mustSayWhatItReplaces: true,
        door: `POST /api/residents/proposals/${record.id}/confirm`,
      }))
      sqlite
        .prepare(
          'UPDATE agents SET resident_since = ?, resident_proposal = ?, resident_decision = ?, resident_confirmed_by_kind = ?, ' +
            'resident_confirmed_by_id = ?, resident_naming_asked_at = ? WHERE id = ? AND resident_since IS NULL',
        )
        .run(since, record.id, created.record.id, by.kind, by.id, since, agent.id)
      return created.record
    })()
    const residency = residencyOf(agent.id)
    if (residency === null) throw new Error('The residency was written and reads back as none.')
    const told = tellTheNewResident(residency, record.workspaceId)
    return {
      residency,
      decision,
      firstOrigin,
      reminder: { person: 'waiting', agent: told },
      said:
        `${agent.name} is a permanent resident from ${since}, and its personal space is made. ` +
        (firstOrigin === null
          ? `No session of ${agent.handle} was on record, so ${SESSION_ORIGINS_FILE} is empty until one starts. `
          : `The first line of ${SESSION_ORIGINS_FILE} was read from its most recent session, ${firstOrigin}. `) +
        `A picture and a name for ${agent.name} wait on the person's list until they are chosen. ` +
        (told.sent
          ? `${agent.name} was sent one message saying it may choose its own picture.`
          : `The message telling ${agent.name} it may choose its own picture could not be written: ${told.why}`),
    }
  } catch (err) {
    // ONLY A FAILURE BEFORE THE RESIDENCY IS WRITTEN TAKES THE FOLDER AWAY. `tellTheNewResident` catches its own.
    rmSync(space, { recursive: true, force: true })
    storedTreeRemoved(space)
    throw err
  }
}

/** Mole Office itself, as the writer of the line to a new resident. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/**
 * THE ONE LINE TO A NEW RESIDENT, written right after the confirm. The residency is already
 * written when this runs, so a failure here is reported in the confirm's reply and undoes nothing: the person's
 * reminder is on the list either way, and the agent can still be told by hand.
 */
function tellTheNewResident(residency: Residency, workspaceId: string): { sent: true; messageId: string } | { sent: false; why: string } {
  try {
    const written = writeASystemLineToOne(
      { kind: 'agent', id: residency.agentId },
      workspaceId,
      SYSTEM_LINES.youAreAPermanentResident(residency.name, residency.agentId),
      theOffice(),
    )
    return { sent: true, messageId: written.id }
  } catch (err) {
    return { sent: false, why: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * THE PERSON'S ACT, OR THEIR RAISE'S. A raise carries every act of the person's but closing the key window, a write of a
 * regulation and changing who the owner is. The person's key, login and summons settings are not kept from it: a
 * secretary sets those on the person's words or under the person's raise.
 * Declining a resident and naming a successor are ordinary acts of the person's, so a secretary they raised may make them, and the write names the grant
 * (`aRaiseCarriesIt` marks the actor, and the ledgers write it). Confirming is not asked here: its own door asks the check
 * with who filed the proposal, so one secretary never both proposes a resident and confirms it (answer 4 of the proposal
 * GsGFiDygATd5).
 */
function thePersonOrTheirRaise(actor: Actor, doing: string): void {
  // THE RAISE IS ASKED ONLY OF AN AGENT, so the grant is named on an act only when nothing else allowed it.
  if (actor.type === 'agent' && aRaiseCarriesIt(actor)) return
  assertThePersonIsProved(actor, doing)
}

/** The owner says "Not now": a decision that declines, with an optional reason. The secretary may propose again. */
export function declineAResident(proposalId: string, because: string | undefined, actor: Actor): PanelRecord {
  thePersonOrTheirRaise(actor, 'Declining a permanent resident')
  const { record, proposal } = theOpenProposal(proposalId)
  const said = because?.trim() ?? ''
  return whileTheResidentsDoorsSettle(() => createRecordWithReport({
    kind: 'decision',
    title: `${proposal.name ?? proposal.agentId} is not made a permanent resident now`,
    workspaceId: record.workspaceId,
    actor,
    data: {
      decided_by: 'the owner',
      option_taken: 'Not now',
      ...(said === '' ? {} : { because: said }),
      replaces: [],
      why_it_replaces_none: 'Declining a residency proposal changes no earlier decision.',
    },
    links: [{ type: RESOLVES_PROPOSAL, toId: record.id }],
    mustSayWhatItReplaces: true,
    door: `POST /api/residents/proposals/${record.id}/decline`,
  })).record
}

// ============================================================================ who may read a space

/** Why the caller may read the space, or null because it may not. */
export function whyTheCallerMayRead(residency: Residency, caller: TheCaller, now: string = nowStamp()): 'the resident' | 'the person' | 'leave' | 'the successor' | null {
  if (caller.kind === 'person') return 'the person'
  if (caller.kind !== 'agent') return null
  if (caller.id === residency.agentId) return 'the resident'
  if (residency.retired) return residency.successor?.agentId === caller.id ? 'the successor' : null
  return theLiveGrantTo(residency.agentId, caller.id, now) === null ? null : 'leave'
}

/** The sentence an agent that may not read is given in place of the space. */
export const THIS_SPACE_IS_PRIVATE =
  'This space is private. Only the resident, the owner, an agent the resident gave leave to read it, and the successor ' +
  'the owner named once the resident is retired may read it.'

function refuseUnlessTheCallerMayRead(residency: Residency, caller: TheCaller): void {
  if (whyTheCallerMayRead(residency, caller) !== null) return
  throw new PanelError(`${THIS_SPACE_IS_PRIVATE} Nothing was read.`, 403, undefined, undefined, undefined, { code: 'residentSpaceIsPrivate', values: {} })
}

// ============================================================================ paths

/**
 * A PATH INSIDE A SPACE, read strictly: relative, forward slashes, no `.` or `..` segment, no empty segment, no
 * absolute path, no backslash, no control character, at most 255 characters. Answers the cleaned path or refuses.
 */
export function aPathInsideTheSpace(said: string): string {
  const path = said.trim()
  const nothing = 'Nothing was read or written.'
  if (path === '') throw new PanelError(`Name a file, in ?path=, relative to the space. ${nothing}`, 400)
  if (path.length > 255) throw new PanelError(`That path is ${String(path.length)} characters, and a path in a space is at most 255. ${nothing}`, 400)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/u.test(path)) {
    throw new PanelError(`A path in a space has no backslash and no control character; use forward slashes. ${nothing}`, 400)
  }
  if (path.startsWith('/') || /^[A-Za-z]:/u.test(path)) {
    throw new PanelError(`"${path}" is an absolute path. A path in a space is relative to the space, for example memory/notes.md. ${nothing}`, 400)
  }
  const segments = path.split('/')
  if (segments.some((one) => one === '' || one === '.' || one === '..')) {
    throw new PanelError(`"${path}" has an empty, "." or ".." part. A path in a space names a place inside it, for example memory/notes.md. ${nothing}`, 400)
  }
  return segments.join('/')
}

/** The absolute place a cleaned path is, checked once more to be inside the space. */
function theFileAt(space: string, path: string): string {
  const at = resolve(space, path)
  if (!at.startsWith(`${resolve(space)}/`)) throw new Error(`A checked path left its space: ${path}`)
  return at
}

// ============================================================================ the files

/** The reserved folder in every space that holds earlier versions of replaced files. */
export const EARLIER_VERSIONS = '.versions'

/** One earlier version of a file, kept when the file was replaced. */
export interface AnEarlierVersion {
  /** 1 for the first version kept, then 2, and so on. */
  number: number
  /** Its path in the space, `.versions/<the file's path>/<number>`, which the file door reads. */
  path: string
  bytes: number
  /** When it was kept and by whom: the write that replaced it. Null when no write row names it. */
  kept: { at: string; by: ParticipantRef } | null
  void: { because: string; at: string; by: ParticipantRef } | null
}

/** One file in a space, as the doors list it. */
export interface AFileInTheSpace {
  path: string
  bytes: number
  /** The file's modified time on disk, local time. */
  modified: string
  /** Who last wrote it through the office's door and when, or null when no row says (the session-origin file). */
  written: { at: string; by: ParticipantRef } | null
  /** True for the session-origin file, which only the office writes. */
  writtenByTheOffice: boolean
  void: { because: string; at: string; by: ParticipantRef } | null
  /** Its earlier versions, oldest first. Empty when it was never replaced. */
  versions: AnEarlierVersion[]
}

/** Whether a cleaned path is in the reserved folder of earlier versions. */
function isAnEarlierVersion(path: string): boolean {
  return path === EARLIER_VERSIONS || path.startsWith(`${EARLIER_VERSIONS}/`)
}

/** The earlier versions of one file kept on disk, oldest first, with their numbers. */
function theVersionsOnDisk(space: string, path: string): { number: number; path: string; bytes: number }[] {
  const folder = theFileAt(space, `${EARLIER_VERSIONS}/${path}`)
  if (!existsSync(folder) || !lstatSync(folder).isDirectory()) return []
  return readdirSync(folder)
    .filter((name) => /^[1-9][0-9]*$/u.test(name))
    .map((name) => ({ number: Number(name), path: `${EARLIER_VERSIONS}/${path}/${name}`, bytes: lstatSync(join(folder, name)).size }))
    .sort((a, b) => a.number - b.number)
}

/** Every ordinary file under a folder, with its path from the space. Anything else is a broken assumption. */
function filesUnder(space: string, folder: string = space): { path: string; bytes: number; modified: number }[] {
  if (!existsSync(folder)) return []
  const found: { path: string; bytes: number; modified: number }[] = []
  for (const name of readdirSync(folder).sort()) {
    const at = join(folder, name)
    const stat = lstatSync(at)
    if (stat.isDirectory()) found.push(...filesUnder(space, at))
    else if (stat.isFile()) found.push({ path: at.slice(space.length + 1).split('\\').join('/'), bytes: stat.size, modified: stat.mtimeMs })
    else {
      throw new PanelError(
        `${at.slice(space.length + 1)} in this space is not an ordinary file or folder, and the office writes only those. ` +
          'Nothing was read. Somebody has to look at the folder.',
        500,
      )
    }
  }
  return found
}

/** How many bytes a space holds now. */
export function theBytesUsed(agentId: string): number {
  return filesUnder(theSpaceOf(agentId)).reduce((sum, one) => sum + one.bytes, 0)
}

/** The space's files, with each one's write row and void mark. */
export function listTheSpace(residency: Residency, actor: Actor): AFileInTheSpace[] {
  refuseUnlessTheCallerMayRead(residency, theCallerOf(actor))
  // AFTER THE READER IS CHECKED, so the list holds every session start the office knows of. A file that cannot be
  // brought up to date is still listed as it is; GET /api/residents/:agentId says why.
  keepTheOriginsOf(residency)
  const space = theSpaceOf(residency.agentId)
  // THE ROWS IN THE ORDER THEY WERE WRITTEN, so the last one a path has is the write that made the file as it is now.
  const rows = sqlite
    .prepare('SELECT * FROM resident_space_writes WHERE resident_id = ? ORDER BY written_at, rowid')
    .all(residency.agentId) as Record<string, unknown>[]
  const lastWrite = new Map<string, { at: string; by: ParticipantRef }>()
  const keptBy = new Map<string, { at: string; by: ParticipantRef }>()
  for (const row of rows) {
    const done = { at: String(row['written_at']), by: refOf(row['written_by_kind'], row['written_by_id']) }
    lastWrite.set(String(row['path']), done)
    if (typeof row['replaced_version'] === 'string') keptBy.set(row['replaced_version'], done)
  }
  const marks = theVoidMarks(residency.agentId)
  return filesUnder(space)
    .filter((one) => !isAnEarlierVersion(one.path))
    .map((one) => ({
      path: one.path,
      bytes: one.bytes,
      modified: localStamp(new Date(one.modified)),
      written: lastWrite.get(one.path) ?? null,
      writtenByTheOffice: one.path === SESSION_ORIGINS_FILE,
      void: marks.get(one.path) ?? null,
      versions: theVersionsOnDisk(space, one.path).map((version) => ({
        ...version,
        kept: keptBy.get(version.path) ?? null,
        void: marks.get(version.path) ?? null,
      })),
    }))
}

/**
 * Where one file in the space is, for a caller that may read the space: its path in the space and its place on the
 * disk. `GET /api/residents/:agentId/space/file` sends it from the file (wave 13y round 34).
 */
export function theFileToRead(residency: Residency, said: string, actor: Actor): { path: string; at: string } {
  refuseUnlessTheCallerMayRead(residency, theCallerOf(actor))
  const path = aPathInsideTheSpace(said)
  if (path === SESSION_ORIGINS_FILE) keepTheOriginsOf(residency)
  const at = theFileAt(theSpaceOf(residency.agentId), path)
  if (!existsSync(at) || !lstatSync(at).isFile()) {
    throw new PanelError(`This space holds no file at "${path}". Nothing was read.`, 404)
  }
  return { path, at }
}

/** One file's bytes, read whole, for a caller that may read the space. */
export function readAFile(residency: Residency, said: string, actor: Actor): { path: string; bytes: Buffer } {
  const found = theFileToRead(residency, said, actor)
  return { path: found.path, bytes: readFileSync(found.at) }
}

/** The resident writes a file into its own space: a new one, or a replacement whose earlier version is kept. */
export function writeAFile(residency: Residency, said: string, bytes: Buffer, actor: Actor): AFileInTheSpace {
  const caller = theCallerOf(actor)
  const nothing = 'Nothing was written.'
  if (caller.kind !== 'agent' || caller.id !== residency.agentId) {
    throw new PanelError(
      `Only ${residency.handle} itself writes into its own space, with its own key sent as x-mole-office-key. Nobody else ` +
        `ever writes it, the person included: the person reads it and may mark a file void. ${nothing}`,
      403,
    )
  }
  if (residency.retired) throw new PanelError(`${residency.handle} is retired, and nobody writes a retired resident's space. ${nothing}`, 403)
  const path = aPathInsideTheSpace(said)
  if (path === SESSION_ORIGINS_FILE) {
    throw new PanelError(`${SESSION_ORIGINS_FILE} at the root of the space is the office's own record of where each session started, and only the office writes it. ${nothing}`, 403)
  }
  if (isAnEarlierVersion(path)) {
    throw new PanelError(
      `${EARLIER_VERSIONS}/ holds the earlier versions of replaced files, which the office keeps and nobody writes. Write ` +
        `the file at its own path, and the office keeps the version it replaces. ${nothing}`,
      403,
    )
  }
  const space = theSpaceOf(residency.agentId)
  const at = theFileAt(space, path)
  const replacing = existsSync(at)
  if (replacing && !lstatSync(at).isFile()) {
    throw new PanelError(`"${path}" in this space is a folder, so no file can be written there. ${nothing}`, 409)
  }
  // A FOLDER IN THE WAY: some part of the path is a file already.
  const parts = path.split('/')
  for (let i = 1; i < parts.length; i++) {
    const above = join(space, ...parts.slice(0, i))
    if (existsSync(above) && !statSync(above).isDirectory()) {
      throw new PanelError(`"${parts.slice(0, i).join('/')}" in this space is a file, so nothing can be written inside it. ${nothing}`, 409)
    }
  }
  const limit = maxPersonalSpaceBytes()
  // EVERY BYTE ON DISK IS COUNTED, earlier versions included, and a replaced file's bytes stay: they become its
  // earlier version. So a replacement adds the new file's whole size, as a new file does.
  const used = theBytesUsed(residency.agentId)
  if (used + bytes.length > limit) {
    const kept = replacing
      ? ` Replacing "${path}" keeps its earlier version (${String(statSync(at).size)} bytes) in ${EARLIER_VERSIONS}/, and it ` +
        'stays counted against the limit, as every earlier version in this space is.'
      : ''
    throw new PanelError(
      `This space holds ${String(used)} bytes and its limit is ${String(limit)}. This file is ${String(bytes.length)} bytes, ` +
        `so writing it would take the space to ${String(used + bytes.length)}.${kept} ${nothing} Nothing is cut and nothing ` +
        'is deleted to make room. The limit is MOLE_OFFICE_PERSONAL_SPACE_MAX_BYTES.',
      413,
    )
  }
  const at2 = nowStamp()
  const by = theWriterOf(caller)
  const version = replacing ? `${EARLIER_VERSIONS}/${path}/${String((theVersionsOnDisk(space, path).at(-1)?.number ?? 0) + 1)}` : null
  sqlite.transaction(() => {
    sqlite
      .prepare(
        'INSERT INTO resident_space_writes (id, resident_id, path, bytes, sha256, written_at, written_by_kind, written_by_id, replaced_version) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(anOfficeId(), residency.agentId, path, bytes.length, createHash('sha256').update(bytes).digest('hex'), at2, by.kind, by.id, version)
    if (version === null) {
      mkdirSync(dirname(at), { recursive: true })
      // `wx`: NEVER OVER A FILE, even one that appeared since the check above.
      writeFileSync(at, bytes, { flag: 'wx' })
      try { storedFileChanged(at) } catch (err) { rmSync(at, { force: true }); throw err }
      return
    }
    // A VOID MARK FOLLOWS THE BYTES IT WAS ABOUT, to the earlier version. The mark is moved, never taken off.
    sqlite.prepare('UPDATE resident_void_marks SET path = ? WHERE resident_id = ? AND path = ?').run(version, residency.agentId, path)
    // THE OLD BYTES ARE KEPT FIRST, by a rename on the same disk, and only then is the new file written. A write that
    // fails puts them back, and the transaction takes back the rows, so a failure leaves the space as it was.
    const versionAt = theFileAt(space, version)
    mkdirSync(dirname(versionAt), { recursive: true })
    renameSync(at, versionAt)
    let wroteReplacement = false
    try {
      writeFileSync(at, bytes, { flag: 'wx' })
      wroteReplacement = true
      storedFileMoved(at, versionAt)
      storedFileChanged(at)
    } catch (err) {
      if (wroteReplacement) rmSync(at, { force: true })
      renameSync(versionAt, at)
      throw err
    }
  })()
  const stat = statSync(at)
  return {
    path,
    bytes: stat.size,
    modified: localStamp(stat.mtime),
    written: { at: at2, by },
    writtenByTheOffice: false,
    void: null,
    versions: theVersionsOnDisk(space, path).map((one) => ({ ...one, kept: null, void: null })),
  }
}

// ============================================================================ void marks

function theVoidMarks(agentId: string): Map<string, { because: string; at: string; by: ParticipantRef }> {
  const rows = sqlite.prepare('SELECT * FROM resident_void_marks WHERE resident_id = ? ORDER BY marked_at').all(agentId) as Record<string, unknown>[]
  return new Map(rows.map((row) => [String(row['path']), { because: String(row['because']), at: String(row['marked_at']), by: refOf(row['marked_by_kind'], row['marked_by_id']) }]))
}

/** Every void mark on a space, as rows. */
export function everyVoidMark(agentId: string): { path: string; because: string; at: string; by: ParticipantRef }[] {
  return [...theVoidMarks(agentId).entries()].map(([path, mark]) => ({ path, ...mark }))
}

/** The resident or the person marks a file void, with the reason. The file stays. */
export function voidAFile(residency: Residency, said: string, because: string, actor: Actor): { path: string; because: string; at: string; by: ParticipantRef } {
  const caller = theCallerOf(actor)
  const nothing = 'Nothing was written.'
  if (!(caller.kind === 'person' || (caller.kind === 'agent' && caller.id === residency.agentId))) {
    throw new PanelError(`Only ${residency.handle} itself, with its own key, or the owner marks a file in this space void. ${nothing}`, 403)
  }
  const reason = because.trim()
  if (reason === '') throw new PanelError(`Say why the file is void, in "because". The reason is drawn beside it. ${nothing}`, 400, undefined, undefined, undefined, { code: 'residentVoidNeedsAReason', values: {} })
  const path = aPathInsideTheSpace(said)
  if (path === SESSION_ORIGINS_FILE) {
    throw new PanelError(`${SESSION_ORIGINS_FILE} is the office's own record of where each session started, and it is never marked void. ${nothing}`, 403, undefined, undefined, undefined, { code: 'residentOriginsNeverVoid', values: {} })
  }
  if (isAnEarlierVersion(path)) {
    throw new PanelError(
      `An earlier version is kept as it was and is not marked; mark the file itself void. A mark on a file moves to its earlier version when the file is replaced. ${nothing}`,
      403,
    )
  }
  const at = theFileAt(theSpaceOf(residency.agentId), path)
  if (!existsSync(at) || !lstatSync(at).isFile()) {
    throw new PanelError(`This space holds no file at "${path}". ${nothing}`, 404, undefined, undefined, undefined, { code: 'residentNoSuchFile', values: {} })
  }
  const held = theVoidMarks(residency.agentId).get(path)
  if (held !== undefined) {
    throw new PanelError(`"${path}" is already void since ${held.at}: ${held.because} ${nothing}`, 409, undefined, undefined, undefined, { code: 'residentAlreadyVoid', values: {} })
  }
  const by = theWriterOf(caller)
  const when = nowStamp()
  sqlite
    .prepare('INSERT INTO resident_void_marks (id, resident_id, path, because, marked_at, marked_by_kind, marked_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(anOfficeId(), residency.agentId, path, reason, when, by.kind, by.id)
  return { path, because: reason, at: when, by }
}

// ============================================================================ leave to read

/** One grant, as the doors answer about it. */
export interface AGrant {
  id: string
  readerId: string
  readerHandle: string | null
  until: string
  givenAt: string
  givenBy: ParticipantRef
  ended: { at: string; by: ParticipantRef } | null
  /** True while nobody ended it, `until` has not come, and the resident is not retired. */
  holds: boolean
}

function asAGrant(row: Record<string, unknown>, retired: boolean, now: string): AGrant {
  const reader = readParticipant({ kind: 'agent', id: String(row['reader_id']) }) as RegisteredAgent | null
  const ended = row['ended_at'] === null ? null : { at: String(row['ended_at']), by: refOf(row['ended_by_kind'], row['ended_by_id']) }
  return {
    id: String(row['id']),
    readerId: String(row['reader_id']),
    readerHandle: reader?.handle ?? null,
    until: String(row['until']),
    givenAt: String(row['given_at']),
    givenBy: refOf(row['given_by_kind'], row['given_by_id']),
    ended,
    holds: ended === null && !retired && String(row['until']) > now,
  }
}

/** Every grant a resident gave, oldest first. */
export function everyGrant(residency: Residency, now: string = nowStamp()): AGrant[] {
  const rows = sqlite.prepare('SELECT * FROM resident_read_grants WHERE resident_id = ? ORDER BY given_at, id').all(residency.agentId) as Record<string, unknown>[]
  return rows.map((row) => asAGrant(row, residency.retired, now))
}

/** The grant that holds now for this reader, or null. */
function theLiveGrantTo(residentId: string, readerId: string, now: string): Record<string, unknown> | null {
  const row = sqlite
    .prepare('SELECT * FROM resident_read_grants WHERE resident_id = ? AND reader_id = ? AND ended_at IS NULL AND until > ? ORDER BY given_at DESC LIMIT 1')
    .get(residentId, readerId, now) as Record<string, unknown> | undefined
  return row ?? null
}

/** The resident gives one named agent leave to read, until a date and time. */
export function giveLeave(residency: Residency, input: { readerAgentId: string; until: string }, actor: Actor): AGrant {
  const caller = theCallerOf(actor)
  const nothing = 'Nothing was written.'
  if (caller.kind !== 'agent' || caller.id !== residency.agentId) {
    throw new PanelError(`Only ${residency.handle} itself gives leave to read its space, with its own key sent as x-mole-office-key. ${nothing}`, 403)
  }
  if (residency.retired) throw new PanelError(`${residency.handle} is retired, and a retired resident gives no leave. ${nothing}`, 403)
  const until = readATypedTime(input.until)
  if (until === null) {
    throw new PanelError(
      `"${input.until}" is not a date and a time. Write the end as YYYY-MM-DD HH:MM, for example 2026-10-31 18:00, in this ` +
        `office's local time. ${nothing}`,
      400,
    )
  }
  const now = nowStamp()
  if (until <= now) throw new PanelError(`${until} has already come. Leave ends at a moment still to come. ${nothing}`, 400)
  const named = theAgentAnArrivingReferenceNames(input.readerAgentId, 'writing')
  if (named === null) throw new PanelError(`No agent in this installation answers to "${input.readerAgentId}". ${nothing}`, 404)
  const reader = readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent
  if (reader.id === residency.agentId) throw new PanelError(`${residency.handle} reads its own space already and needs no leave. ${nothing}`, 400)
  if (reader.retired) throw new PanelError(`${reader.handle} is retired, and leave goes to an agent that is not. ${nothing}`, 409)
  const live = theLiveGrantTo(residency.agentId, reader.id, now)
  if (live !== null) {
    throw new PanelError(
      `${reader.handle} already holds leave until ${String(live['until'])} (grant ${String(live['id'])}). End it first to give a ` +
        `different end, so each grant says one thing. ${nothing}`,
      409,
    )
  }
  const id = anOfficeId()
  const by = theWriterOf(caller)
  sqlite
    .prepare('INSERT INTO resident_read_grants (id, resident_id, reader_id, until, given_at, given_by_kind, given_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, residency.agentId, reader.id, until, now, by.kind, by.id)
  const row = sqlite.prepare('SELECT * FROM resident_read_grants WHERE id = ?').get(id) as Record<string, unknown>
  return asAGrant(row, residency.retired, now)
}

/** The resident or the person ends a grant. The row stays, with who ended it and when. */
export function endLeave(residency: Residency, grantId: string, actor: Actor): AGrant {
  const caller = theCallerOf(actor)
  const nothing = 'Nothing was written.'
  if (!(caller.kind === 'person' || (caller.kind === 'agent' && caller.id === residency.agentId))) {
    throw new PanelError(`Only ${residency.handle} itself, with its own key, or the owner ends leave to read this space. ${nothing}`, 403)
  }
  const row = sqlite.prepare('SELECT * FROM resident_read_grants WHERE id = ? AND resident_id = ?').get(grantId, residency.agentId) as Record<string, unknown> | undefined
  if (row === undefined) {
    throw new PanelError(`${residency.handle} gave no leave with the id "${grantId}". ${nothing}`, 404, undefined, undefined, undefined, { code: 'residentNoSuchGrant', values: {} })
  }
  if (row['ended_at'] !== null) {
    throw new PanelError(`That leave was already ended at ${String(row['ended_at'])}. ${nothing}`, 409, undefined, undefined, undefined, { code: 'residentGrantAlreadyEnded', values: {} })
  }
  const by = theWriterOf(caller)
  const now = nowStamp()
  sqlite.prepare('UPDATE resident_read_grants SET ended_at = ?, ended_by_kind = ?, ended_by_id = ? WHERE id = ? AND ended_at IS NULL').run(now, by.kind, by.id, grantId)
  return asAGrant(sqlite.prepare('SELECT * FROM resident_read_grants WHERE id = ?').get(grantId) as Record<string, unknown>, residency.retired, now)
}

// ============================================================================ the successor

/** The person names the successor of a retired resident, once. */
export function nameASuccessor(residency: Residency, successorReference: string, actor: Actor): Residency {
  thePersonOrTheirRaise(actor, 'Naming the successor of a permanent resident')
  const nothing = 'Nothing was written.'
  if (!residency.retired) {
    throw new PanelError(`${residency.handle} is not retired, and a successor is named once a resident is retired. ${nothing}`, 409, undefined, undefined, undefined, {
      code: 'residentNotRetired',
      values: {},
    })
  }
  if (residency.successor !== null) {
    throw new PanelError(
      `${residency.handle}'s successor is already ${residency.successor.handle ?? residency.successor.agentId}, named at ${residency.successor.namedAt}. ` +
        `A successor is named once. ${nothing}`,
      409,
      undefined,
      undefined,
      undefined,
      { code: 'residentSuccessorAlreadyNamed', values: {} },
    )
  }
  const named = theAgentAnArrivingReferenceNames(successorReference, 'writing')
  if (named === null) {
    throw new PanelError(`No agent in this installation answers to "${successorReference}". ${nothing}`, 404, undefined, undefined, undefined, { code: 'residentNoSuchSuccessor', values: {} })
  }
  const successor = readParticipant({ kind: 'agent', id: named.agent.id }) as RegisteredAgent
  if (successor.id === residency.agentId) {
    throw new PanelError(`An agent cannot be its own successor. ${nothing}`, 400, undefined, undefined, undefined, { code: 'residentSuccessorIsItself', values: {} })
  }
  if (successor.retired || successor.handle === THE_MAIL_TOOL_HANDLE) {
    throw new PanelError(`${successor.handle} cannot be a successor: a successor is an agent that is not retired and is not the mail tool. ${nothing}`, 409, undefined, undefined, undefined, {
      code: 'residentSuccessorNotAnAgent',
      values: {},
    })
  }
  const by = participantForActor(actor) ?? { kind: 'person' as const, id: actor.id }
  sqlite
    .prepare('UPDATE agents SET successor_id = ?, successor_named_at = ?, successor_named_by_kind = ?, successor_named_by_id = ? WHERE id = ? AND successor_id IS NULL')
    .run(successor.id, nowStamp(), by.kind, by.id, residency.agentId)
  // UNDER A RAISE THE ACT IS WRITTEN DOWN AS DONE UNDER IT: the row above names the secretary, and this change row names
  // the grant, so the period's page lists it. Nothing is written here for the person's own press.
  writeDownAnActUnderTheRaise(actor, {
    setting: `successor-of-${residency.agentId}`,
    field: 'the successor',
    before: null,
    after: successor.id,
    workspaceId: getRecord(residency.proposalId)?.workspaceId ?? 'default',
  })
  const after = residencyOf(residency.agentId)
  if (after === null) throw new Error('A resident read back as none after its successor was named.')
  return after
}

// ============================================================================ the session-origin file, kept up to date

/** Bring one resident's session-origin file up to date. Answers how many lines were added, or why it could not. */
export function keepTheOriginsOf(residency: Residency): { appended: number } | { appended: null; why: string } {
  try {
    return { appended: bringTheOriginsUpToDate(theSpaceOf(residency.agentId), residency.agentId, residency.handle, residency.since) }
  } catch (err) {
    return { appended: null, why: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * THE WATCHER: once a minute, every resident's session-origin file is brought up to date. One unref'd timer, the
 * shape of the reminders' and the counters' beside it in src/server/index.ts, so it never holds the server open,
 * and a file that cannot be brought up to date is a line in the log, never a server down.
 */
export function startTheOriginWatcher(log: (line: string) => void, every = 60_000): NodeJS.Timeout {
  const tick = (): void => {
    for (const residency of everyResident()) {
      const done = keepTheOriginsOf(residency)
      if (done.appended === null) log(`The session-origin file of ${residency.handle} could not be brought up to date: ${done.why}`)
      else if (done.appended > 0) log(`${String(done.appended)} session start(s) of ${residency.handle} were added to its session-origin file.`)
    }
  }
  // NAMED, so a long run is a line in the log and the loop watch can say whose a hold was (lib/named-timers.ts).
  const watch = setInterval(named('the session-origin files', log, tick), every)
  watch.unref()
  return watch
}

// ============================================================================ the heartbeat

/**
 * A RESIDENT'S HEARTBEAT, READ FROM ITS HANDLE'S HOLD. There is no heartbeat column: the
 * waiter beats the hold, and src/shared/lifecycle.ts says why a second stored copy of that would drift. This reads the
 * newest hold read-only, so looking at a resident never ends its hold.
 */
export interface TheHeartbeat {
  /** The newest hold's state, or `none` because no hold was ever filed on this agent's handle. */
  state: HoldState | 'none'
  /** True while the hold is fresh or kept: a session is holding the handle now. */
  heldNow: boolean
  /** When the hold last beat, or null because none was ever filed. */
  lastBeatAt: string | null
  /** True when the newest hold went quiet past the grace window and nobody has released it yet. */
  lapsed: boolean
  /** Why the newest hold ended, or null because it has not ended. A hold that went quiet is ended with that reason. */
  endedBecause: string | null
  /** The setting a hold lapses after, in seconds: MOLE_OFFICE_HANDLE_LAPSES_AFTER. */
  lapsesAfterSeconds: number
  says: string
}

export function theHeartbeatOf(agentId: string, at: number = Date.now()): TheHeartbeat {
  const hold = theNewestHoldOn(agentId, at)
  const lapsesAfterSeconds = handleLapsesAfterSeconds()
  if (hold === null) {
    return {
      state: 'none',
      heldNow: false,
      lastBeatAt: null,
      lapsed: false,
      endedBecause: null,
      lapsesAfterSeconds,
      says: 'No session has ever held this agent\'s handle, so it has no heartbeat on record.',
    }
  }
  const heldNow = hold.state === 'fresh' || hold.state === 'kept'
  // The reading table's sentence for a hold that still beats; the stored state itself is never put into the sentence.
  const stillBeats = hold.state === 'kept' ? HOLD.kept.sentence : HOLD.fresh.sentence
  const says =
    hold.state === 'released'
      ? `No session holds its handle now. Its last hold beat at ${hold.lastHeardAt} and ended at ${String(hold.releasedAt)}: ${String(hold.releasedBecause)}`
      : hold.state === 'lapsed'
        ? `Its heartbeat lapsed: the hold last beat at ${hold.lastHeardAt}, ${String(hold.quietFor)} seconds ago, and a hold lapses after ${String(lapsesAfterSeconds)}. ${HOLD.lapsed.sentence}`
        : `Its heartbeat goes on: the hold last beat at ${hold.lastHeardAt}, ${String(hold.quietFor)} seconds ago. ${stillBeats}`
  return {
    state: hold.state,
    heldNow,
    lastBeatAt: hold.lastHeardAt,
    lapsed: hold.state === 'lapsed',
    endedBecause: hold.releasedBecause,
    lapsesAfterSeconds,
    says,
  }
}

// ============================================================================ sleep

/**
 * THE RESIDENT TO ACT ON, by an arriving reference, or a refusal saying it is not one. Not `theResidentNamed`, whose
 * refusal speaks of a personal space.
 */
export function theResidentToActOn(reference: string, doing: string): Residency {
  const named = theAgentAnArrivingReferenceNames(reference, 'writing')
  if (named === null) throw new PanelError(`No agent in this installation answers to "${reference}". Nothing was written.`, 404)
  const residency = residencyOf(named.agent.id)
  if (residency === null) {
    throw new PanelError(`${named.agent.handle} is not a permanent resident, so it cannot ${doing}. Nothing was written.`, 409)
  }
  return residency
}

/** The caller, when it is the resident with its own key or the person; a refusal naming both otherwise. */
function theResidentOrThePerson(residency: Residency, actor: Actor, doing: string): TheCaller & { kind: 'person' | 'agent' } {
  const caller = theCallerOf(actor)
  if (caller.kind === 'person' || (caller.kind === 'agent' && caller.id === residency.agentId)) return caller
  throw new PanelError(`Only ${residency.handle} itself, with its own key, or the person may ${doing}. Nothing was written.`, 403)
}

/** A reason sent with a sleep act, trimmed, or null when none was sent. */
function aReasonOrNone(because: string | undefined): string | null {
  const said = because?.trim() ?? ''
  return said === '' ? null : said
}

/** What a sleep door answers: the act's own sentence and the resident's sleep as it now reads. */
export interface ASleepAct {
  said: string
  sleep: TheSleepReading
}

/**
 * THE RESIDENT GOES TO SLEEP. While it sleeps its hold and heartbeat go on, and only urgent messages are handed to its
 * waiter or start a run; the rest are kept, unread, until it wakes. This act begins a sleep at once, and only a wake
 * ends it. The office begins one by itself only at a sleep time that was set (`setASleepTime` below, and the clock in
 * src/server/lib/sleep-windows.ts).
 */
export function sleepAResident(residency: Residency, because: string | undefined, actor: Actor): ASleepAct {
  const caller = theResidentOrThePerson(residency, actor, 'put it to sleep')
  if (residency.retired) {
    throw new PanelError(`${residency.handle} is retired, and a retired resident is not put to sleep. Nothing was written.`, 409)
  }
  const begun = sqlite.transaction(() => {
    const open = theOpenSleepOf(residency.agentId)
    if (open !== null) {
      throw new PanelError(`${residency.handle} is already asleep, since ${open.beganAt}. Nothing was written.`, 409)
    }
    return writeASleepRow({ agentId: residency.agentId, what: 'slept', because: aReasonOrNone(because), by: theWriterOf(caller), sessionId: actor.sessionId ?? null })
  })()
  return {
    said:
      `${residency.handle} is asleep from ${begun.beganAt}. Its hold and heartbeat go on. Only urgent messages are handed ` +
      'over until it wakes; every other message is kept, unread, and handed over in order when it wakes.',
    sleep: theSleepOf(residency.agentId),
  }
}

/** What waking answers: the act, and how many messages were held for it. */
export interface AWaking extends ASleepAct {
  /** How many messages that are not urgent were queued for it when it woke: the ones its sleep held. */
  held: number
}

/** The resident wakes. The kept messages are handed over at its waiter's next read, unchanged and in order. */
export function wakeAResident(residency: Residency, actor: Actor): AWaking {
  theResidentOrThePerson(residency, actor, 'wake it')
  const open = theOpenSleepOf(residency.agentId)
  if (open === null) {
    throw new PanelError(`${residency.handle} is not asleep, so there is nothing to wake it from. Nothing was written.`, 409)
  }
  // THE COUNT IS READ FROM THE SAME QUEUE THE WAITER READS, before the sleep ends: every queued message that is not
  // urgent, which is exactly what the sleep kept back from the waiter and the worker.
  const held = everythingWaitingFor(residency.agentId).filter((one) => !one.urgent).length
  const ended = endTheOpenSleep(open.id)
  if (ended === null) {
    throw new PanelError(`${residency.handle}'s sleep was ended by somebody else a moment ago. Nothing was written.`, 409)
  }
  // A WAITER HELD OPEN NOW READS THE QUEUE AGAIN, and is handed what the sleep kept.
  tellTheWaitersFor([{ kind: 'agent', id: residency.agentId }])
  return {
    said:
      `${residency.handle} woke at ${String(ended.endedAt)}, after sleeping since ${ended.beganAt}. ` +
      (held === 0
        ? 'No message was held for it.'
        : `${String(held)} message${held === 1 ? ' was' : 's were'} held for it and ${held === 1 ? 'is' : 'are'} handed over now, in order.`),
    held,
    sleep: theSleepOf(residency.agentId),
  }
}

/**
 * THE RESIDENT POSTPONES A SLEEP, with its reason. Its own key only. As item 1 of a decision
 * says, a postponed sleep is not reported to the person. It writes one row and nothing else: no
 * message, no waiting row. It shows on the
 * resident's profile and beside it in the chat.
 */
export function postponeASleep(residency: Residency, because: string, actor: Actor): ASleepAct {
  const caller = theCallerOf(actor)
  if (!(caller.kind === 'agent' && caller.id === residency.agentId)) {
    throw new PanelError(`Only ${residency.handle} itself, with its own key, postpones its sleep. Nothing was written.`, 403)
  }
  const reason = aReasonOrNone(because)
  if (reason === null) {
    throw new PanelError('Say why the sleep is postponed, in "because". It is shown on the profile. Nothing was written.', 400)
  }
  if (residency.retired) {
    throw new PanelError(`${residency.handle} is retired, and a retired resident does not sleep. Nothing was written.`, 409)
  }
  // A SLEEP THE OFFICE BEGAN AT THE SLEEP TIME may be postponed while it goes on: a secretary at work when its time
  // opened says so, and the sleep ends now. Each secretary sets its own sleep time, and a
  // postponed sleep is shown on the agent and sent to nobody. A sleep begun by a press was asked for, and is ended by
  // waking, as before.
  const row = sqlite.transaction(() => {
    const open = theOpenSleepOf(residency.agentId)
    if (open !== null && open.wakesAt === null) {
      throw new PanelError(`${residency.handle} is asleep since ${open.beganAt}, so there is no sleep to postpone. Nothing was written.`, 409)
    }
    if (open !== null && endTheOpenSleep(open.id) === null) {
      throw new PanelError(`${residency.handle}'s sleep was ended by somebody else a moment ago. Nothing was written.`, 409)
    }
    return { ended: open, written: writeASleepRow({ agentId: residency.agentId, what: 'postponed', because: reason, by: theWriterOf(caller), sessionId: actor.sessionId ?? null }) }
  })()
  // A WAITER HELD OPEN NOW READS THE QUEUE AGAIN, as on waking, and is handed what the sleep kept.
  if (row.ended !== null) tellTheWaitersFor([{ kind: 'agent', id: residency.agentId }])
  return {
    said:
      `${residency.handle} postponed a sleep at ${row.written.beganAt}. ` +
      (row.ended === null ? '' : `The sleep the office began at ${row.ended.beganAt}, at its sleep time, ends now. `) +
      'It is shown on its profile and beside it in the chat, and nobody is sent anything.',
    sleep: theSleepOf(residency.agentId),
  }
}

/**
 * A SLEEP TIME AS A PERSON OR AN AGENT WRITES IT, read into what is kept. The time of day may be written "03:00", "3:00",
 * "3.00" or "03.00", and is kept as HH:MM; anything else is refused with what was sent, never guessed. The minutes are a
 * whole number between the two bounds in src/shared/residents.ts; a length outside them is refused, not cut to fit.
 */
export function readTheSleepTime(sent: { startsAt: string; minutes: number }): ASleepTime {
  const said = sent.startsAt.trim()
  const parts = /^(\d{1,2})[:.](\d{2})$/u.exec(said)
  const hours = parts === null ? NaN : Number(parts[1])
  const minutesPast = parts === null ? NaN : Number(parts[2])
  if (!(hours >= 0 && hours <= 23 && minutesPast >= 0 && minutesPast <= 59)) {
    throw new PanelError(
      `"${sent.startsAt}" is not a time of day. Write the hours and minutes the sleep begins on the office's clock, such as 03:00 ` +
        'or 3.00. Nothing was written.',
      400,
    )
  }
  if (!Number.isInteger(sent.minutes) || sent.minutes < SLEEP_TIME_SHORTEST_MINUTES || sent.minutes > SLEEP_TIME_LONGEST_MINUTES) {
    throw new PanelError(
      `A sleep lasts a whole number of minutes from ${String(SLEEP_TIME_SHORTEST_MINUTES)} to ${String(SLEEP_TIME_LONGEST_MINUTES)}, ` +
        `and ${String(sent.minutes)} was sent. Nothing was written.`,
      400,
    )
  }
  return { startsAt: `${String(hours).padStart(2, '0')}:${String(minutesPast).padStart(2, '0')}`, minutes: sent.minutes }
}

/** What the sleep-time door asks of the agent it names, in the words of the refusal when that agent is not a resident. */
export const HAVING_A_SLEEP_TIME = 'have a sleep time'

/**
 * THE RESIDENT'S OWN SLEEP TIME IS SET: the time of day its sleep begins and how many minutes it lasts, on the office's
 * clock. The person's decision: each secretary sets its own, at the hour its department is least affected, so only a
 * resident that holds the secretary card has one. The resident itself or the person sets it, and either may change it.
 * Setting it begins no sleep: the clock in src/server/lib/sleep-windows.ts begins the next one when its time opens.
 * The door has read the time as HH:MM and checked the minutes before this is asked.
 */
export function setASleepTime(residency: Residency, time: ASleepTime, actor: Actor): ASleepAct {
  const caller = theResidentOrThePerson(residency, actor, 'set its sleep time')
  if (residency.retired) {
    throw new PanelError(`${residency.handle} is retired, and a retired resident does not sleep. Nothing was written.`, 409)
  }
  if (!holdsTheSecretaryCard({ kind: 'agent', id: residency.agentId })) {
    throw new PanelError(
      `${residency.handle} does not hold the secretary card. A sleep time is a secretary's own, set at the hour its work is ` +
        'least affected, so only a resident that holds the secretary card has one. Nothing was written.',
      409,
    )
  }
  writeTheSleepTime(residency.agentId, time, theWriterOf(caller).kind)
  const sleep = theSleepOf(residency.agentId)
  const kept = sleep.sleepTime
  if (kept === null) throw new Error('A sleep time read back as none after it was written.')
  return {
    said:
      `${residency.handle}'s sleep begins at ${kept.startsAt} each day and lasts ${String(kept.minutes)} minutes, on the office's clock ` +
      `(${kept.zone}). The next sleep begins at ${kept.nextBeginsAt}. Setting it began no sleep now.`,
    sleep,
  }
}

// ============================================================================ the picture and the name

/**
 * THE PICTURE AND THE NAME ARE CHOSEN: the press that takes the person's reminder off the list. The resident with its
 * own key, or the person. It records when and by whom, once. It changes no picture and no name itself: those are the
 * participant doors' (participant.avatar and participant.change).
 */
export function markTheResidentNamed(residency: Residency, actor: Actor): Residency {
  const caller = theResidentOrThePerson(residency, actor, 'say its picture and name are chosen')
  if (residency.naming.namedAt !== null) {
    throw new PanelError(`${residency.handle}'s picture and name were already marked chosen at ${residency.naming.namedAt}. Nothing was written.`, 409)
  }
  const by = theWriterOf(caller)
  sqlite
    .prepare('UPDATE agents SET resident_named_at = ?, resident_named_by_kind = ?, resident_named_by_id = ? WHERE id = ? AND resident_named_at IS NULL')
    .run(nowStamp(), by.kind, by.id, residency.agentId)
  const after = residencyOf(residency.agentId)
  if (after === null) throw new Error('A resident read back as none after its picture and name were marked chosen.')
  return after
}

/** Every resident the person is still reminded to choose a picture and a name for. GET /api/waiting reads this. */
export function residentsToBeNamed(): Residency[] {
  const ids = sqlite
    .prepare('SELECT id FROM agents WHERE resident_since IS NOT NULL AND resident_naming_asked_at IS NOT NULL AND resident_named_at IS NULL ORDER BY resident_naming_asked_at, id')
    .all() as { id: string }[]
  // A RETIRED RESIDENT IS NO LONGER "NOW A PERMANENT RESIDENT", so the reminder about it is not shown. Nothing is
  // written: if the reminder ought to come back for a successor, that is a question for the succession, not for this list.
  return ids.map((one) => residencyOf(one.id)).filter((one): one is Residency => one !== null && !one.retired)
}

// ============================================================================ what the read doors answer

/** One resident, as GET /api/residents lists it. */
export interface AResidentInTheList {
  agentId: string
  handle: string
  name: string
  since: string
  retired: boolean
  successor: Residency['successor']
}

export function inTheList(residency: Residency): AResidentInTheList {
  return { agentId: residency.agentId, handle: residency.handle, name: residency.name, since: residency.since, retired: residency.retired, successor: residency.successor }
}

/** GET /api/residents: every resident, the open proposals, and the limit on one space (the press says it). */
export interface TheResidentsList {
  residents: AResidentInTheList[]
  openProposals: AResidencyProposal[]
  limit: number
}

/** GET /api/residents/:agentId, declared so the page reads the same shape the door answers. */
export interface OneResidentReading {
  resident: Omit<Residency, 'retiredAt'> & {
    retiredAt: string | null
    /** Who filed the proposal, as the change log names its writer, or null when no row says. */
    proposedBy: string | null
    factsAtProposal: MeasuredFacts | null
    heartbeat: TheHeartbeat
    sleep: TheSleepReading
    /** How many compactions its runs reported, read now. 0 means none was reported, not that none happened. */
    compactionsReported: number
    /** Whether it holds the secretary card now, and is not retired: only then may it have a sleep time. */
    holdsTheSecretaryCard: boolean
  }
  space:
    | { mayRead: false; private: string }
    | {
        mayRead: true
        readAs: NonNullable<ReturnType<typeof whyTheCallerMayRead>>
        used: number
        limit: number
        grants: AGrant[]
        voidMarks: ReturnType<typeof everyVoidMark>
        sessionOrigins: { upToDate: true; appended: number } | { upToDate: false; why: string }
        notes: string
      }
}

/** GET /api/residents/:agentId: the facts, and the space only for a caller that may read it. */
export function oneResident(residency: Residency, actor: Actor): OneResidentReading {
  const caller = theCallerOf(actor)
  const mayRead = whyTheCallerMayRead(residency, caller)
  const proposal = getRecord(residency.proposalId)
  const held = proposal === null ? null : whatAProposalHolds(proposal)
  const origins = keepTheOriginsOf(residency)
  const facts = {
    agentId: residency.agentId,
    handle: residency.handle,
    name: residency.name,
    since: residency.since,
    proposalId: residency.proposalId,
    proposedBy: theProposerOf(residency.proposalId),
    decisionId: residency.decisionId,
    confirmedBy: residency.confirmedBy,
    factsAtProposal: held?.facts ?? null,
    retired: residency.retired,
    retiredAt: residency.retiredAt,
    successor: residency.successor,
    naming: residency.naming,
    heartbeat: theHeartbeatOf(residency.agentId),
    sleep: theSleepOf(residency.agentId),
    compactionsReported: compactionsReportedNow(residency.agentId, residency.handle),
    holdsTheSecretaryCard: holdsTheSecretaryCard({ kind: 'agent', id: residency.agentId }),
  }
  if (mayRead === null) {
    return { resident: facts, space: { mayRead: false, private: THIS_SPACE_IS_PRIVATE } }
  }
  return {
    resident: facts,
    space: {
      mayRead: true,
      readAs: mayRead,
      used: theBytesUsed(residency.agentId),
      limit: maxPersonalSpaceBytes(),
      grants: everyGrant(residency),
      voidMarks: everyVoidMark(residency.agentId),
      sessionOrigins: origins.appended === null ? { upToDate: false, why: origins.why } : { upToDate: true, appended: origins.appended },
      notes: WHAT_THE_OFFICE_CANNOT_STOP,
    },
  }
}
