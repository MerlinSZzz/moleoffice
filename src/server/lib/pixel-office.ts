// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { PixelScale } from '@shared/pixel-scale.ts'
import { isMoleOffice } from '@shared/participants.ts'
import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'
import { sqlite } from '../db/client.ts'
import { nowStamp } from '@shared/time.ts'
import {
  DEFAULT_PIXEL_SCENE, C_LOOK_CATALOGUE_VERSION, generateCWholeAppearance, resolvePixelAppearance, pixelAppearanceSchema, pixelSceneSettingsSchema, pixelDefaultRefreshPlanSchema,
  type CForestAppearance, type PixelAppearance, type PixelDefaultRefreshPlan, type PixelMotionSetting, type ResolvedPixelAppearance, type PixelSceneSettings, type PixelZone,
} from '@shared/pixel-office.ts'
import { aRaiseCarriesIt, type Actor } from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { type WhatTheCallerIsDoing } from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { theAgentRowAnIdNames } from './the-agent-row-an-id-names.ts'
import { whyTheChangeIsRefused } from '@shared/why-the-change-is-refused.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theElevationHeldBy } from './elevation.ts'
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from './not-proved-the-person.ts'

export interface PixelSettingsReading {
  /** Whether the office map moves: of the stored scene, the one setting a person changes (wave 13y round 119). */
  settings: PixelMotionSetting
  chosen: boolean
  updatedAt: string | null
  updatedBy: { kind: string; id: string; authority: string | null } | null
  mayChange: boolean
  refusal: string | null
}
export function pixelSettingsRefusal(actor: Actor): string | null {
  if (participantForActor(actor) === null) return 'Only a registered person or an authorized secretary can change whether the office map moves.'
  // AND A STATED PERSON HAS TO HOLD THE PERSON'S KEY. Criterion P83, point 1: the header claim is
  // attribution, and the key is what makes a caller the person.
  if (thePersonIsProved(actor) || actor.theOwnersAuthority?.holds === true) return null
  // A SECRETARY THEY HAVE RAISED, asked where every door a raise opens asks it, which holds the rule that a run the office
  // started does not inherit the grant (criterion M81) and names the grant on the write it allowed.
  if (aRaiseCarriesIt(actor)) return null
  // THE WORDS ARE WRITTEN IN ONE PLACE, lib/not-proved-the-person.ts: why this request is not them
  // and the way on. The screen draws this sentence before anything is pressed, so it says nothing
  // about what was done.
  return theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, null), {
    refused: "Changing whether the office map moves is the person's own act",
    nothingWasDone: null,
    whoMay: 'A secretary the person has authorized for the time being may change it too.',
  })
}
/**
 * CHANGING WHETHER THE OFFICE MAP MOVES IS THE PERSON'S OWN ACT, ASKED BEFORE THE WRITE.
 *
 * The rule is `pixelSettingsRefusal` above, and this is the door the write path asks, so that the
 * act is a registered guard rather than a condition written inline. `office.scene-settings.change`
 * is declared under `The person's own acts` in design/permissions/roles.json. It is kept from main
 * because src/server/lib/records.ts names it as the registered guard for that act.
 */
export function assertMayChangeTheOfficeScene(actor: Actor): void {
  // THE RULE IS ABOVE, AND THIS FILE OWNS IT. `pixelSettingsRefusal` is the one statement of who may
  // change whether the office map moves; this door throws exactly what it refuses, so its refusal and the
  // `mayChange` flag drawn on its screen come from one reading rather than two. It is registered as
  // a governance guard so the act is named in the same list as every other act of the person's.
  //
  // AND THE GUARD ITSELF ASKS THE KEY QUESTION, through `pixelSettingsRefusal` and not beside it.
  // Criterion P83, point 1: a stated person who holds no key is not the person. The helper below
  // asks it, and the flag drawn on the screen asks the same helper, so the door and the drawing
  // cannot disagree and this refusal's sentence exists in one place.
  const refusal = pixelSettingsRefusal(actor)
  if (refusal === null) return
  throw new PanelError(refusal, 403)
}
/**
 * THE STORED SCENE, WHOLE, with who stored it, or null while nobody has. The older built-in map read all seven settings
 * (wave 13y round 119 deleted it). Whether the office map moves is read from here, and the default-look refresh reads
 * rare items, so the row is still read whole and a row the shape refuses is still refused.
 */
function theStoredScene(): { settings: PixelSceneSettings; updatedAt: string; updatedBy: NonNullable<PixelSettingsReading['updatedBy']> } | null {
  const held = sqlite.prepare('SELECT * FROM office_scene_settings WHERE only_row = 1').get() as Record<string, unknown> | undefined
  if (held === undefined) return null
  return {
    settings: pixelSceneSettingsSchema.parse(JSON.parse(String(held['settings']))), updatedAt: String(held['updated_at']),
    updatedBy: { kind: String(held['updated_by_kind']), id: String(held['updated_by_id']), authority: held['authority'] == null ? null : String(held['authority']) },
  }
}
export function pixelSettings(actor: Actor): PixelSettingsReading {
  const stored = theStoredScene()
  const refusal = pixelSettingsRefusal(actor)
  if (stored === null) return { settings: { motion: DEFAULT_PIXEL_SCENE.motion }, chosen: false, updatedAt: null, updatedBy: null, mayChange: refusal === null, refusal }
  return { settings: { motion: stored.settings.motion }, chosen: true, updatedAt: stored.updatedAt, updatedBy: stored.updatedBy, mayChange: refusal === null, refusal }
}
/** Changes whether the office map moves, and nothing else of the stored scene: the other six are written back as they were. */
export function changePixelSettings(value: PixelMotionSetting, actor: Actor): PixelSettingsReading {
  assertMayChangeTheOfficeScene(actor)
  const settings: PixelSceneSettings = { ...(theStoredScene()?.settings ?? DEFAULT_PIXEL_SCENE), motion: value.motion }
  const by = participantForActor(actor)!
  const authority = actor.theOwnersAuthority?.holds === true ? actor.theOwnersAuthority.because : actor.type === 'agent' ? theElevationHeldBy(actor.id)?.id ?? null : null
  sqlite.prepare('INSERT INTO office_scene_settings (only_row, settings, updated_at, updated_by_kind, updated_by_id, authority) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(only_row) DO UPDATE SET settings=excluded.settings, updated_at=excluded.updated_at, updated_by_kind=excluded.updated_by_kind, updated_by_id=excluded.updated_by_id, authority=excluded.authority')
    .run(JSON.stringify(settings), nowStamp(), by.kind, by.id, authority)
  return pixelSettings(actor)
}
export interface PixelAppearanceReading extends ResolvedPixelAppearance {
  agentId: string
  scale: PixelScale | null
  mayChange: boolean
  refusal: string | null
}
/** One permission reader for single edits and default refreshes, including the existing test-world grant. */
export function pixelAppearanceRefusal(agentId: string, actor: Actor): string | null {
  const who = { kind: 'agent' as const, id: agentId }, by = participantForActor(actor)
  const refusal = whyTheChangeIsRefused('avatar', who, by)
  if (by !== null && !isMoleOffice(who) && actor.theOwnersAuthority?.holds === true) return null
  return refusal
}
/**
 * ONE AGENT'S PIXEL LOOK. `agentId` arrives in the path and may be the agent's id or its handle, so
 * the one resolver says which agent it names, criterion I2, and the row is then read by its registry
 * id. A change asks as a write, which refuses a retired agent's handle.
 */
export function pixelAppearance(agentId: string, actor: Actor, doing: WhatTheCallerIsDoing = 'reading'): PixelAppearanceReading {
  const found = theAgentAnArrivingReferenceNames(agentId, doing)
  const held = found === null ? null : readParticipant({ kind: 'agent', id: found.agent.id })
  if (held === null || !('retired' in held)) throw new PanelError(`No registered agent has the id or the handle "${agentId}".`, 404)
  const refusal = pixelAppearanceRefusal(held.id, actor)
  return {
    scale: held.pixelScale ?? null,
    agentId: held.id, ...resolvePixelAppearance(held.id, held.pixelAppearance ?? null),
    mayChange: refusal === null, refusal,
  }
}
export function changePixelAppearance(agentId: string, value: unknown, actor: Actor): PixelAppearanceReading {
  const before = pixelAppearance(agentId, actor, 'writing')
  if (before.refusal !== null) throw new PanelError(before.refusal, 403)
  const appearance = value === null ? null : pixelAppearanceSchema.parse(value)
  if (appearance?.version === 2 && appearance.generation && appearance.generation.source !== 'random-preview') {
    // Registration and batch provenance are written only by their respective operations.
    if (JSON.stringify(appearance) === JSON.stringify(before.appearance)) return before
    throw new PanelError('An appearance saved here cannot claim a registration or default-refresh origin. Preview a random look or choose one explicitly. Nothing was written.', 400)
  }
  sqlite.prepare('UPDATE agents SET pixel_appearance = ? WHERE id = ?').run(appearance === null ? null : JSON.stringify(appearance), before.agentId)
  return pixelAppearance(before.agentId, actor)
}

export interface PixelDefaultRefreshPreview {
  plan: PixelDefaultRefreshPlan
  moles: { agentId: string; name: string; previous: PixelAppearance; appearance: CForestAppearance }[]
  excluded: { saved: number; noPermission: { agentId: string; name: string; reason: string }[] }
}
export interface PixelDefaultRefreshResult {
  batchId: string
  updated: string[]
  skipped: { agentId: string; code: 'already-saved' | 'permission-refused' | 'missing' | 'changed'; reason: string }[]
}
function defaultRefreshAppearance(plan: PixelDefaultRefreshPlan, id: string): CForestAppearance {
  const seed = createHash('sha256').update(plan.batchId + '\0' + id).digest('hex')
  return generateCWholeAppearance(seed, 'default-refresh', plan.rareItems, plan.batchId)
}
/** Preview is a read. Saved scale is neither a filter nor a field this operation writes. */
export function previewDefaultPixelAppearances(actor: Actor): PixelDefaultRefreshPreview {
  const plan: PixelDefaultRefreshPlan = { version: 1, batchId: nanoid(24), catalogueVersion: C_LOOK_CATALOGUE_VERSION, rareItems: (theStoredScene()?.settings ?? DEFAULT_PIXEL_SCENE).rareItems, agentIds: [] }
  const moles: PixelDefaultRefreshPreview['moles'] = [], excluded: PixelDefaultRefreshPreview['excluded'] = { saved: 0, noPermission: [] }
  for (const agent of listParticipants().agents.sort((a, b) => a.id.localeCompare(b.id))) {
    if (agent.pixelAppearance != null) { excluded.saved++; continue }
    const refusal = pixelAppearanceRefusal(agent.id, actor)
    if (refusal !== null) { excluded.noPermission.push({ agentId: agent.id, name: agent.name, reason: refusal }); continue }
    plan.agentIds.push(agent.id)
    moles.push({ agentId: agent.id, name: agent.name, previous: resolvePixelAppearance(agent.id, null).appearance, appearance: defaultRefreshAppearance(plan, agent.id) })
  }
  return { plan, moles, excluded }
}
/**
 * Recheck each identity and explain every skipped row. Work, seat and scale fields are never written. A plan made before
 * the re-mint names an agent by its old id, so each id is read through its filed alias and the row is written by the
 * canonical id. The appearance is still made from the id the plan names, so the one saved is the one the preview drew.
 */
export function applyDefaultPixelAppearances(value: unknown, actor: Actor): PixelDefaultRefreshResult {
  const plan = pixelDefaultRefreshPlanSchema.parse(value)
  return sqlite.transaction(() => {
    const result: PixelDefaultRefreshResult = { batchId: plan.batchId, updated: [], skipped: [] }
    const write = sqlite.prepare('UPDATE agents SET pixel_appearance = ? WHERE id = ? AND pixel_appearance IS NULL')
    for (const id of plan.agentIds) {
      const held = theAgentRowAnIdNames(id)
      if (held === null || !('retired' in held)) { result.skipped.push({ agentId: id, code: 'missing', reason: 'This identity is no longer registered.' }); continue }
      if (held.pixelAppearance != null) { result.skipped.push({ agentId: id, code: 'already-saved', reason: 'An appearance was saved after this preview, so it was retained.' }); continue }
      const refusal = pixelAppearanceRefusal(held.id, actor)
      if (refusal !== null) { result.skipped.push({ agentId: id, code: 'permission-refused', reason: refusal }); continue }
      const appearance = defaultRefreshAppearance(plan, id)
      if (write.run(JSON.stringify(appearance), held.id).changes !== 1) { result.skipped.push({ agentId: id, code: 'changed', reason: 'This default changed before it could be saved.' }); continue }
      result.updated.push(id)
    }
    return result
  })()
}

import { classifyPixelWork, classifyPixelTask, type PixelDetail } from '@shared/pixel-office.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { howARunStands, type RunStanding } from '@shared/releasing.ts'
import type { PanelRecord } from '@shared/types.ts'
import { listRecords } from './records.ts'
import { type RegisteredAgent } from './participants.ts'
import { theseAgentsInTheRegistrysOrder } from '../db/these-agents-in-the-registrys-order.ts'
import { agentsWithTheseIds } from '../db/agents-with-these-ids.ts'
import { listParticipants } from '../db/list-participants.ts'
import { recordsForAgentsIn } from '../db/records-for-agents-in.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { isThisAgentOnline, participantPresence, sessionRecordsForTheOfficeIn, sessionRecordsTheDotsReadIn, theAgentFactsReadOnce, thePresenceReadingsOf, theUnreleasedProcessRowsOnce, type ParticipantPresenceReading } from './presence.ts'
import { theseAgentsOnly } from '../db/these-agents-only.ts'
import { aRunWhoseCheckRanAsOneOf, theAgentsOfTheseRuns, theCheckAskedFor } from './inspection.ts'
import { liveClaimsIn } from './claims.ts'
import type { ClaimOnTheWire } from '@shared/claims.ts'
import { theRunsInFlight, theRunsInFlightAmong, theWaitRanOut } from './worker.ts'
import { eachAgentsIdentityReadOnce, everyAgentsIdentityWithReferencesReadOnce } from './agent-references.ts'
import { theFiledAliasesReadOnce, type TheFiledAliases } from './registry-aliases/runs.ts'
import { type ATalkEntry, type ATalkEntryInViews, type AWithdrawnMessage, type TheirOwnMessages } from './messages.ts'
import { messagePoolAtOrAfter } from './message-pool-at-or-after.ts'
import { newestMessagePoolFirst } from './newest-message-pool-first.ts'
import { newestWithdrawnMessagePoolFirst } from './newest-withdrawn-message-pool-first.ts'
import { theirOwnMessages } from '../db/their-own-messages.ts'
import { theirTalksPool } from './their-talks-pool.ts'
import { theTalksPool } from './the-talks-pool.ts'
import { whyReadingSomebodyElsesIsRefused } from '@shared/why-reading-somebody-elses-is-refused.ts'
import { withdrawnMessagePool } from './withdrawn-message-pool.ts'
import { withdrawnMessagePoolAfter } from './withdrawn-message-pool-after.ts'

export interface PixelWork {
  id: string; workspaceId: string; title: string; detail: PixelDetail
  executing: boolean; association: 'handle' | 'process' | 'conversation wait' | 'work claim'
  recordedState: unknown; doing: string | null; updatedAt: string
  /** Where a run stands (src/shared/releasing.ts), or null for a claimed task or block, which is not a run. */
  runStanding: RunStanding | null
}
export interface PixelMole {
  id: string; handle: string; name: string; createdAt: string; role: string | null; retired: boolean
  zone: PixelZone
  team: string | null; startedBy: ParticipantRef | null
  projects: { id: string; name: string; recordId: string | null }[]
  presence: ParticipantPresenceReading
  presenceByProject: { workspaceId: string; reading: ParticipantPresenceReading }[]
  appearance: PixelAppearance; appearanceChosen: boolean; scale: PixelScale | null
  work: PixelWork[]; historicalUnclosed: number
  historicalWork: { id: string; workspaceId: string; title: string; detail: PixelDetail }[]
}
export interface PixelCommunication {
  id: string; workspaceId: string; at: string; from: ParticipantRef; to: readonly ParticipantRef[]
}
/**
 * WHO TALKED TO WHOM IN THESE PROJECTS, AS THE CALLER MAY SEE IT, OLDEST FIRST, WITH NO WORDS. Only an authored message
 * that was sent counts. A caller who may not read somebody else's messages (`othersRefusal` is the sentence why) sees
 * only the ones they sent or were sent. The plugins' read view `talk` (src/server/lib/plugin-read.ts) takes them from
 * here. The older built-in map took them from here too, until wave 13y round 119 deleted it.
 */
export function thePermittedCommunications(
  projects: readonly { id: string }[],
  caller: ParticipantRef | null,
  othersRefusal: string | null,
): PixelCommunication[] {
  return theWholeTalk(projects, theReaderOfTheTalk(caller, othersRefusal))
}

/**
 * WHO READS THE TALK, AND WHAT THEY MAY READ OF IT, worked out once for a whole answer of the talk door (wave 13y round
 * 78). Until then its messages and its withdrawals each read the caller's own list.
 *
 * A CALLER WHO MAY NOT READ ANYBODY ELSE'S IS HANDED ONLY WHAT THEY SENT OR WERE HANDED (`theirs`): by the whole talk
 * since round 75, and by the talk door's walk, its read from a place and its withdrawals since round 76. The pool holds
 * every message `aCallerSeesIt` could keep for them, and that rule still decides. Undefined, for no narrowing, when the
 * caller may read everybody's, or is nobody and so sees nothing.
 */
export interface ATalkReader {
  readonly caller: ParticipantRef | null
  readonly othersRefusal: string | null
  readonly theirs: TheirOwnMessages | undefined
}

export function theReaderOfTheTalk(caller: ParticipantRef | null, othersRefusal: string | null): ATalkReader {
  return { caller, othersRefusal, theirs: othersRefusal === null || caller === null ? undefined : theirOwnMessages(caller) }
}

/**
 * The whole talk of these projects for this reader. For the person, each project is still read by a statement of its
 * own, each way into its view through that way's index (`theTalksPool`). A caller who may read only their own reads
 * every project in one statement (`theirTalksPool`, round 110), since their own list was looked up again for each.
 */
export function theWholeTalk(projects: readonly { id: string }[], reader: ATalkReader): PixelCommunication[] {
  if (reader.theirs !== undefined) return permittedCommunicationsOf(theirTalksPool(projects.map((project) => project.id), reader.theirs), reader)
  const communications: PixelCommunication[] = []
  for (const project of projects) {
    // THE AUTHORED MESSAGES ONLY, read once and built once (wave 13y round 25). The pool has left the others out, so each
    // one it hands back is authored.
    for (const message of theTalksPool(project.id, reader.theirs)) {
      if (!aCallerSeesIt(message, true, reader.caller, reader.othersRefusal)) continue
      communications.push({ id: message.id, workspaceId: project.id, at: message.sentAt, from: message.sentBy, to: message.to })
    }
  }
  communications.sort(compareCommunicationPlaces)
  return communications
}

/**
 * The same visibility and order as `thePermittedCommunications`, with certainly earlier moments left out by the pool.
 * Every project of the list is read in one statement (round 78).
 */
export function thePermittedCommunicationsAtOrAfter(projects: readonly { id: string }[], reader: ATalkReader, at: string): PixelCommunication[] {
  return permittedCommunicationsOf(messagePoolAtOrAfter(projects.map((project) => project.id), at, reader.theirs), reader)
}

/**
 * Find the newest permitted moment of every project in doubling batches, then finish that moment before comparing ids.
 * A caller who may read little can need the first message, or the whole history if none is permitted. That takes
 * about log2(N) batch reads for N rows, then a read to finish the moment. No SQL recipient shortcut substitutes for
 * aCallerSeesIt: recipients and whether a comment went out come from the builder. A caller who may read only their own
 * walks only what they sent or were handed (`theReaderOfTheTalk`), which leaves out only what that rule could not keep.
 *
 * ONE WALK FOR EVERY PROJECT OF THE LIST (round 78). Until then each project was walked in turn, and the newest of each
 * compared at the end: the newest moment of any of them is the newest of the union, so the answer is the same.
 */
export function theNewestPermittedCommunication(projects: readonly { id: string }[], reader: ATalkReader): PixelCommunication | undefined {
  const ids = projects.map((project) => project.id)
  for (const batch of newestMessagePoolFirst(ids, reader.theirs)) {
    const permitted = batch.find(message => aCallerSeesIt(message, true, reader.caller, reader.othersRefusal))
    if (permitted === undefined) continue
    return permittedCommunicationsOf(messagePoolAtOrAfter(ids, permitted.sentAt, reader.theirs), reader).at(-1)
  }
  return undefined
}

/** The talk's order and cursor cut, in one place. SQLite's byte order must not decide a boundary id. */
export function compareCommunicationPlaces(a: Pick<PixelCommunication, 'at' | 'id'>, b: Pick<PixelCommunication, 'at' | 'id'>): number {
  return a.at.localeCompare(b.at) || a.id.localeCompare(b.id)
}

/**
 * A message in the views of two projects is the talk's once for each, in the order of the list, as when each project was
 * read by a statement of its own. The sort keeps that order between them, since they share their moment and their id.
 */
function permittedCommunicationsOf(pool: readonly ATalkEntryInViews[], reader: ATalkReader): PixelCommunication[] {
  const communications: PixelCommunication[] = []
  for (const { entry: message, projects } of pool) {
    if (!aCallerSeesIt(message, true, reader.caller, reader.othersRefusal)) continue
    for (const workspaceId of projects) communications.push({ id: message.id, workspaceId, at: message.sentAt, from: message.sentBy, to: message.to })
  }
  communications.sort(compareCommunicationPlaces)
  return communications
}

/**
 * THE MESSAGES OF THESE PROJECTS WITHDRAWN NOW THAT THE CALLER WOULD SEE WERE THEY NOT, by id, oldest withdrawal first,
 * each placed by the delete that withdrew it (`withdrawnMessagePool`). The plugins' read view `talk` names them (see
 * gap G9). The rule of which a caller sees is the one `thePermittedCommunications` keeps. A message in the view of two
 * projects is named once.
 */
export function thePermittedWithdrawals(
  projects: readonly { id: string }[],
  caller: ParticipantRef | null,
  othersRefusal: string | null,
): { id: string; order: number }[] {
  return permittedWithdrawalsOf(projects.flatMap((project) => withdrawnMessagePool(project.id)), { caller, othersRefusal })
}

/**
 * Only withdrawals after the place, or the newest one this caller may know when no place was asked for. Every project of
 * the list in one statement, and one walk (round 78): the newest of any of them is the newest of the union.
 */
export function theTalkWithdrawals(projects: readonly { id: string }[], reader: ATalkReader, after: number | undefined): { id: string; order: number }[] {
  const ids = projects.map((project) => project.id)
  if (after !== undefined) return permittedWithdrawalsOf(withdrawnMessagePoolAfter(ids, after, reader.theirs), reader)
  for (const one of newestWithdrawnMessagePoolFirst(ids, reader.theirs)) {
    if (aCallerSeesIt(one.entry, one.authored, reader.caller, reader.othersRefusal)) return [{ id: one.entry.id, order: one.order }]
  }
  return []
}

function permittedWithdrawalsOf(
  pool: Iterable<AWithdrawnMessage>, reader: Pick<ATalkReader, 'caller' | 'othersRefusal'>,
): { id: string; order: number }[] {
  const withdrawn = new Map<string, number>()
  for (const one of pool) {
    if (aCallerSeesIt(one.entry, one.authored, reader.caller, reader.othersRefusal)) withdrawn.set(one.entry.id, one.order)
  }
  return [...withdrawn].map(([id, order]) => ({ id, order })).sort((a, b) => a.order - b.order)
}

/**
 * WHETHER THE TALK SHOWS A CALLER THIS MESSAGE, worked out here and nowhere else. Only an authored message that was sent
 * counts. A caller who may not read somebody else's messages (`othersRefusal` is the sentence why) sees only the ones
 * they sent or were sent.
 */
function aCallerSeesIt(
  message: ATalkEntry,
  authored: boolean,
  caller: ParticipantRef | null,
  othersRefusal: string | null,
): message is ATalkEntry & { sentBy: ParticipantRef } {
  const same = (a: ParticipantRef | null, b: ParticipantRef | null) => a !== null && b !== null && a.kind === b.kind && a.id === b.id
  if (!authored || message.sentBy === null || message.notSentYet) return false
  return othersRefusal === null || same(message.sentBy, caller) || message.to.some(to => same(to, caller))
}

/** WHETHER AN AGENT IS FROM ANOTHER OFFICE: it was let in on a credential. The plugins' `visitor`. */
export function isAVisitor(agent: Pick<RegisteredAgent, 'credential'>): boolean {
  return agent.credential !== null
}

/**
 * ONE READING OF THE OFFICE, FOR THE PLUGIN'S PEOPLE, WORK AND ONLINE VIEWS AND THE STATUS OF NAMED AGENTS (wave 13y
 * round 46).
 *
 * Each part is read the first time an answer asks for it, and then kept for the rest of the reading. The plugin's people
 * view asks only who each agent is, its projects and its presence, and its work view only each agent's work, so neither
 * reads what it does not carry. Until round 46 each view built the whole scene of the older built-in map, and kept a few
 * fields of it. Each part is worked out here and only here.
 *
 * `scope` is asked by every caller (wave 13y round 119). Until then a caller could leave it out and the stored scene's
 * scope was read, which read the stored scene for every view. 'office' reads every project, 'workspace' only this one.
 *
 * This does not call any conversation route or delivery/read mutation. Nothing in it writes an agent row.
 */
export interface TheOfficeRead {
  scope: PixelSceneSettings['scope']
  projects: ReturnType<typeof listWorkspaces>
  now: Date
  caller: ParticipantRef | null
  othersRefusal: string | null
  /** The agents the reading holds, in the order of the registry: every agent, or under scope 'workspace' those it links to. */
  agents: () => readonly RegisteredAgent[]
  /** The projects one agent is linked to: its own record there, or a run of it there. */
  projectsOf: (agent: RegisteredAgent) => PixelMole['projects']
  /** Who one agent is. */
  whoOf: (agent: RegisteredAgent) => Omit<PixelMole, 'projects' | 'presence' | 'presenceByProject' | 'work' | 'historicalUnclosed' | 'historicalWork'>
  /** One agent's current work: its runs going, waiting or claimed, and the tasks and blocks it claims. */
  workOf: (agent: RegisteredAgent) => PixelWork[]
  /** One agent's presence in every project, and the one the compact dot draws. */
  presenceOf: (agent: RegisteredAgent) => Pick<PixelMole, 'presence' | 'presenceByProject'>
  /** Whether one agent is online: its dot green in some project, or grey with the words "In a terminal" (wave 13y round 66). */
  onlineOf: (agent: RegisteredAgent) => boolean
  /** One agent's runs that are not current and wait on a check, a report or a rebuttal. */
  historicalWorkOf: (agent: RegisteredAgent) => PixelMole['historicalWork']
  /** The runs of these projects that are fixtures, and those whose origin is neither authored nor a fixture. A reading of some agents refuses it. */
  origins: () => { excludedFixtures: number; unverifiedOrigins: number }
  /**
   * The runs the reading holds, read once and kept: of a reading of some agents, those of these projects that could be
   * theirs, found by their needles; of a whole reading, every run of these projects.
   */
  sessions: () => readonly PanelRecord[]
}

/**
 * WHETHER AN AGENT LEADS OTHER SUPERVISORS: it is a supervisor, and it started a supervisor among `children`, which holds
 * at least every agent it started. `children` is read only for a supervisor. Written once for a whole reading and for
 * a reading of some agents, which reads only the agents those agents started (wave 13y round 51). A child's row
 * written before an alias was filed for its starter keeps the starter's old id, so the stored starter is read through
 * `aliases`.
 */
function isAHigherSupervisor(agent: RegisteredAgent, children: () => readonly RegisteredAgent[], aliases: TheFiledAliases): boolean {
  return agent.role === 'supervisor' && children().some(child => child.role === 'supervisor' && child.startedBy?.kind === 'agent' && aliases.canonicalOf(child.startedBy.id) === agent.id)
}

/** The ids of the records a claim names. */
const theRecordsClaimed = (claim: ClaimOnTheWire): string[] => claim.things.filter(t => t.what === 'record').map(t => t.id)

/**
 * `asked` IS A READING OF THESE AGENTS ONLY, for a plugin view asked for a list of them (wave 13y round 51): the agents
 * with these ids, in the registry's order. Of each reading the agents share, it reads only the rows that could be theirs,
 * and the same code below decides from those rows what it decides from every row. So what it answers for each of them is
 * what the whole reading answers, and its cost does not grow with the office. Still read whole: the process rows, the
 * machine and the lines that said goodbye to a run. tests/a-plugin-views-list-reads-only-the-agents-it-names.test.ts
 * holds both halves.
 *
 * `aliases` is the filed aliases of a request that has read them already, so the request reads them once.
 */
export function readTheOffice(workspaceId: string, actor: Actor, scope: PixelSceneSettings['scope'], asked?: readonly string[], aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite)): TheOfficeRead {
  const projects = listWorkspaces().filter(p => scope === 'office' || p.id === workspaceId)
  const now = new Date()
  const caller = participantForActor(actor)
  const othersRefusal = whyReadingSomebodyElsesIsRefused(caller)
  const agents = asked === undefined ? listParticipants().agents : theseAgentsInTheRegistrysOrder(asked)
  // THE FILED REGISTRY ALIASES, READ AT MOST ONCE FOR THE WHOLE READING (`aliases`): for the rows below, the process rows
  // and every dot.
  // THE ROWS THAT COULD BE THESE AGENTS': their own records, and the sessions whose serving fields or binding name one of
  // them by its id, an alias filed for it, its handle or one of those records (`aSessionThatCouldBeOneOf` says why that
  // is enough). `theseAgentsOnly` adds the filed aliases, as the answering look at named agents has it add them.
  const only = asked === undefined ? undefined : theseAgentsOnly(agents.map(agent => agent.id), agents.map(agent => agent.handle), aliases)
  /** A part read the first time it is asked for, and kept. */
  const kept = <T>(read: () => T): (() => T) => {
    let held: { value: T } | null = null
    return () => (held ??= { value: read() }).value
  }
  /** A part of one agent, read the first time it is asked for that agent, and kept. */
  const keptFor = <T>(read: (agent: RegisteredAgent) => T): ((agent: RegisteredAgent) => T) => {
    const held = new Map<string, T>()
    return (agent) => {
      if (!held.has(agent.id)) held.set(agent.id, read(agent))
      return held.get(agent.id) as T
    }
  }
  // EVERY AGENT'S IDENTITY, READ ONCE FOR THE READING (wave 13y round 46). Three walks over every run, and every agent's
  // dot in every project, ask which agent a run serves; each ask read one agent's row by its id. A reading of some agents
  // asks about their runs only, and reads each id it is asked.
  const identityOf = only === undefined ? everyAgentsIdentityWithReferencesReadOnce(sqlite) : eachAgentsIdentityReadOnce(sqlite)
  const sessionsByProject = new Map(projects.map(p => [p.id, kept(() => sessionRecordsForTheOfficeIn(p.id, only!.needles))]))
  // EVERY RUN OF EACH PROJECT, read the first time it is asked for. The dots read fewer rows (`sessionRecordsTheDotsReadIn`),
  // and of these only the agent each ran as (wave 13y round 66).
  const everyRunOf = new Map(projects.map(p => [p.id, kept(() => listRecords({ workspaceId: p.id, kind: 'session' }))]))
  const sessions = kept(() => projects.flatMap(p => only === undefined
    ? everyRunOf.get(p.id)!()
    : sessionsByProject.get(p.id)!().listed))
  // A preview server belongs to a session but is not that agent executing. Use the worker's own reading of the runs it
  // has going: the runtime page's `inFlight`, read without the rest of that page. A reading of some agents asks it of
  // their sessions, which are the only runs it asks about.
  const alive = kept(() => new Set((only === undefined ? theRunsInFlight(undefined, identityOf) : theRunsInFlightAmong(sessions(), identityOf)).map(run => run.session)))
  // THE REGISTRY READ ABOVE IS HANDED TO EVERY CLAIM'S STANDING and to the owner of every run, so it
  // is not read again for each claim (since 27 September 2026). Nothing in this reading writes an agent row.
  const registry = () => agents
  // AND EACH AGENT'S OWN FACTS ARE READ ONCE, not once in each project its dot is read in (`theAgentFactsReadOnce`).
  const facts = theAgentFactsReadOnce(now, true, registry, identityOf, () => waiting(), only?.ids)
  // A READING OF SOME AGENTS reads the claims they make and the claims their runs hold, and the tasks and blocks those
  // claims name, which are the only ones `currentOf` keeps.
  const claims = kept(() => {
    const these = only === undefined ? undefined : { claimants: only.ids, runs: sessions().map(s => s.id) }
    return projects.flatMap(p => liveClaimsIn(p.id, registry, these))
  })
  const tasks = kept(() => {
    const claimed = only === undefined ? undefined : [...new Set(claims().flatMap(theRecordsClaimed))]
    return projects.flatMap(p => ['task', 'block'].flatMap(kind => listRecords({ workspaceId: p.id, kind: kind as 'task' | 'block', ...(claimed === undefined ? {} : { ids: claimed }) })))
  })
  const claimedRuns = kept(() => new Set(claims().map(claim => claim.run)))
  // EACH PROJECT IS READ ONCE FOR THE WHOLE SCENE, not once per agent (problem u_yThQczHiZ8): the
  // machine, the session rows, the waiting runs and the process rows every agent's dot reads, and
  // every agent's own record in the project. The process rows are one reading for every project.
  // On 25 September 2026 reading them per agent made one scene take 48 seconds.
  const processes = theUnreleasedProcessRowsOnce(only?.recordsOf, aliases)
  // A READING OF EVERY AGENT reads, of each project, the runs that have not ended and the message worker's runs, which are
  // all the dots read, and hands in every run for the agents they ran as (wave 13y round 66).
  const readings = new Map(projects.map(p => [p.id, only === undefined
    ? thePresenceReadingsOf(p.id, processes, identityOf, undefined, false, () => sessionRecordsTheDotsReadIn(p.id), everyRunOf.get(p.id)!, aliases)
    : thePresenceReadingsOf(p.id, processes, identityOf, only, false, () => sessionsByProject.get(p.id)!().presence, undefined, aliases)]))
  const agentRecords = kept(() => new Map(projects.map(p => [p.id, recordsForAgentsIn(p.id, only?.ids)])))
  const waiting = kept(() => new Set(projects.flatMap(p => readings.get(p.id)!.waiting()).filter(w => !w.over).map(w => w.session)))
  // EACH AGENT'S RUNS, SORTED OUT ONCE, in the order `sessions` holds them. Looking through every run for every agent
  // was about 0.4 s of a 2.5 s scene on a copy of the office at the live counts, 981 agents and 9,425 runs (wave 13y round 25).
  const runsOf = kept(() => {
    const owner = theAgentsOfTheseRuns(sessions(), registry, identityOf)
    const byAgent = new Map<string, PanelRecord[]>()
    for (const session of sessions()) {
      const agentId = owner.get(session.id)
      if (agentId === undefined || agentId === null) continue
      const runs = byAgent.get(agentId)
      if (runs === undefined) byAgent.set(agentId, [session])
      else runs.push(session)
    }
    return byAgent
  })
  // THE RUNS A CHECK IS RUNNING ON. A reading of some agents reads only the sessions whose check ran as one of the runs
  // going, which are their runs, and reads none while none of theirs is going.
  const checking = kept(() => {
    const out = new Set<string>()
    const among = only === undefined ? sessions() : alive().size === 0 ? [] : projects.flatMap(p => listRecords({ workspaceId: p.id, kind: 'session', alsoWhere: aRunWhoseCheckRanAsOneOf([...alive()]) }))
    for (const session of among) {
      const execution = theCheckAskedFor(session)?.execution
      if (execution && !execution.endedAt && !execution.failed && alive().has(execution.session)) out.add(execution.session)
    }
    return out
  })
  const ownSessions = (agent: RegisteredAgent) => runsOf().get(agent.id) ?? []
  // A RUN IS LOOKED FOR AMONG THE WAITING RUNS ONLY WHILE ITS WAIT MAY NOT BE OVER (wave 13y round 91, item 24). The
  // waiting runs keep none whose wait is over when they are read, which is after `now`, so a run whose wait was over at
  // `now` is not among them. Reading them to ask would read every line that names a run, for nothing.
  const waits = (s: PanelRecord) => !theWaitRanOut(s.data, now.getTime()) && waiting().has(s.id)
  const projectsOf = keptFor((agent): PixelMole['projects'] =>
    projects.map(p => ({ id: p.id, name: p.title, recordId: agentRecords().get(p.id)!.get(agent.id) ?? null }))
      .filter(p => p.recordId !== null || ownSessions(agent).some(s => s.workspaceId === p.id)))
  // THE CURRENT RUNS AND THE WORK DRAWN FOR THEM, read together because both read the hold on the agent's handle. The
  // hold is the one the agent's dot reads, read for every agent at once at the reading's instant (wave 13y round 50).
  const currentOf = keptFor((agent) => {
    const hold = facts.hold(agent.id)
    const current = ownSessions(agent).filter(s => s.origin === 'authored' && (hold?.session === s.id || alive().has(s.id) || waits(s) || claimedRuns().has(s.id)))
    const work = current.map((s): PixelWork => {
      const executing = alive().has(s.id) && s.data['state'] === 'running'
      return {
        id: s.id, workspaceId: s.workspaceId, title: s.title,
        detail: classifyPixelWork(s.data, executing, checking().has(s.id), waits(s)),
        executing, association: hold?.session === s.id ? 'handle' : executing ? 'process' : waits(s) ? 'conversation wait' : 'work claim',
        recordedState: s.data['state'] ?? null, doing: typeof s.data['doing'] === 'string' ? s.data['doing'] : null,
        updatedAt: s.updatedAt, runStanding: howARunStands(s.data).standing,
      }
    })
    const claimedIds = new Set(claims().filter(c => c.claimant.kind === 'agent' && c.claimant.id === agent.id).flatMap(theRecordsClaimed))
    for (const task of tasks().filter(t => t.origin === 'authored' && claimedIds.has(t.id))) {
      work.push({ id: task.id, workspaceId: task.workspaceId, title: task.title, detail: classifyPixelTask(task.data),
        executing: false, association: 'work claim', recordedState: task.data['state'] ?? null,
        doing: typeof task.data['also_waiting_on'] === 'string' ? task.data['also_waiting_on'] : null, updatedAt: task.updatedAt, runStanding: null })
    }
    return { current, work }
  })
  // THE AGENTS THESE AGENTS STARTED, for a reading of some agents, read the first time a supervisor among them is drawn.
  // An agent may be stored as started by an old id filed for one of them, so each is asked by every id filed for it.
  const children = only === undefined ? () => agents : kept(() => [...agentsWithTheseIds((sqlite.prepare('SELECT id FROM agents WHERE started_by_id IN (SELECT value FROM json_each(?))').all(JSON.stringify(only.ids.flatMap(id => aliases.everyIdOf(id)))) as { id: string }[]).map(row => row.id)).values()])
  const whoOf: TheOfficeRead['whoOf'] = (agent) => {
    const higherSupervisor = isAHigherSupervisor(agent, children, aliases)
    const zone: PixelMole['zone'] = isAVisitor(agent) ? 'visitor' : agent.role === 'secretary' ? 'secretary' : agent.role === 'inspector' ? 'inspector' : higherSupervisor ? 'leadership' : agent.role === 'worker' || agent.role === 'supervisor' ? 'team' : 'unassigned'
    const appearance = resolvePixelAppearance(agent.id, agent.pixelAppearance ?? null)
    return {
      createdAt: agent.createdAt, id: agent.id, handle: agent.handle, name: agent.name, role: agent.role, retired: agent.retired,
      // A worker's team is its starter's canonical id, as the starter's own team is; `startedBy` stays as stored.
      zone, team: agent.role === 'supervisor' ? agent.id : agent.startedBy?.kind === 'agent' ? aliases.canonicalOf(agent.startedBy.id) : null,
      startedBy: agent.startedBy,
      scale: agent.pixelScale ?? null,
      appearance: appearance.appearance, appearanceChosen: appearance.chosen,
    }
  }
  const presenceOf: TheOfficeRead['presenceOf'] = (agent) => {
    const presenceByProject = projects.map(project => {
      const read = readings.get(project.id)!
      return { workspaceId: project.id, reading: participantPresence({ kind: 'agent', id: agent.id }, project.id, now, caller, true, read.machine, read.sessions, read.waiting, read.processes, read.agentRecords, read.runningRows, undefined, { facts, messageRows: read.messageRows, ranAs: read.ranAs, sessionsOf: read.sessionsOf, aliases, ...(only === undefined ? {} : { machineOfTheSession: read.machineOfTheSession }) }) }
    })
    // Pick an answering reading for the compact dot, while retaining every project's original answer.
    const presence = presenceByProject.find(p => p.reading.colour === 'green')?.reading ?? presenceByProject[0]!.reading
    return { presence, presenceByProject }
  }
  // FROM THE SAME READINGS AS `presenceOf`, through the dot's own steps (`isThisAgentOnline`), without the words beside a
  // grey dot. It stops at the first project the agent is online in.
  const onlineOf: TheOfficeRead['onlineOf'] = (agent) => projects.some(project => {
    const read = readings.get(project.id)!
    return isThisAgentOnline(agent.id, project.id, now, true, read.machine, read.sessions, read.waiting, read.runningRows, { facts, messageRows: read.messageRows, aliases, machineOfTheSession: read.machineOfTheSession })
  })
  const historicalWorkOf: TheOfficeRead['historicalWorkOf'] = (agent) => {
    const { current } = currentOf(agent)
    return ownSessions(agent).filter(s => s.origin === 'authored' && !current.includes(s) && ['waiting_check', 'reporting', 'rebuttal'].includes(classifyPixelWork(s.data, false))).map(s => ({ id: s.id, workspaceId: s.workspaceId, title: s.title, detail: classifyPixelWork(s.data, false) }))
  }
  return {
    scope, projects, now, caller, othersRefusal,
    agents: kept(() => agents.filter(agent => scope !== 'workspace' || projectsOf(agent).length > 0)),
    projectsOf, whoOf, workOf: (agent) => currentOf(agent).work, presenceOf, onlineOf, historicalWorkOf, sessions,
    origins: kept(() => {
      if (only !== undefined) throw new Error('A reading of some agents holds only the runs that could be theirs, so it cannot count the runs of these projects. Read the whole office for the counts.')
      let excludedFixtures = 0
      let unverifiedOrigins = 0
      for (const session of sessions()) {
        if (session.origin === 'fixture') excludedFixtures++
        else if (session.origin !== 'authored') unverifiedOrigins++
      }
      return { excludedFixtures, unverifiedOrigins }
    }),
  }
}
