// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READ-ONLY INTERFACE A PLUGIN READS THROUGH, VERSION 1: SIX VIEWS, BUILT HERE AND NOWHERE ELSE. Wave 13x round 14,
 * step 2 of the plugin pipeline udGnc-Bsr15R (block 1DP8abzhUpNb). The routes are src/server/api/plugin-read.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A VIEW MAY CARRY
 * ---------------------------------------------------------------------------------------
 *
 * Each view picks its fields by name from what the office already reads; nothing is passed through whole, so a field
 * added to a participant or a run later does not reach a plugin by accident. No view carries the words of a message, a
 * key, or a field named like one. No view writes: the people and work views read the office through `readTheOffice`,
 * which writes nothing. tests/the-plugin-read-interface-v1.test.ts holds this.
 *
 * EACH VIEW READS ONLY THE PARTS IT CARRIES (wave 13y round 46). Each view built the whole scene of the older built-in
 * map, which wave 13y round 119 deleted, and kept a few fields of it. The people view now reads who each agent is, its
 * projects and its presence; the work view reads each agent's work. Since round 119 no view reads the stored scene.
 * tests/the-pixel-office-reads-each-agents-facts-once.test.ts compares both with what they answered before.
 *
 * THE PEOPLE AND WORK VIEWS ANSWER FOR THE AGENTS ASKED, AND THE ROSTER SAYS WHO EVERYBODY IS (wave 13y round 50). A
 * page that draws some agents names them in ?agents=, and only their parts are read; the answer is the whole view's,
 * kept to those agents. The roster reads the two registries and works nothing out. agents= with nothing after it does
 * not read the office at all. tests/the-plugin-views-read-many-agents-at-once.test.ts holds this.
 *
 * THE ONLINE VIEW SAYS ONLY WHETHER EACH AGENT IS ONLINE (wave 13y round 66, item 2). It follows the steps of the
 * people view's dot as far as they say that, and no further: it never reads every unreleased process row of the office,
 * as the people view's later steps do.
 * tests/the-online-view-says-whether-each-agent-is-online.test.ts holds this.
 *
 * NO VIEW CARRIES THE MOMENT IT WAS BUILT. So the same office gives the same body, and the ETag every read operation
 * gets (src/server/lib/version-tags.ts) answers a plugin that asks again with 304 when nothing changed.
 *
 * NOR A STAMP OF THE MOMENT THE OFFICE WAS READ AT (gap G10, wave 13x round 17: it does not fit). The views
 * read holds, claims, delivery marks, workspaces, agents, running processes and the clock, and the change log does not
 * record every change to them. So no stamp drawn from the change log would say that two answers were read from the same
 * office. The one exact stamp is a digest of the answer itself, and that is the ETag.
 *
 * THE TALK VIEW READS ON FROM A PLACE (wave 13x round 17). start=latest begins at the newest message without replaying
 * any (gap G7), and `withdrawn` names the messages withdrawn since the last read (G9), so a plugin that keeps
 * what it read can drop them.
 *
 * THE TYPES OF THE SIX VIEWS ARE PUBLISHED IN src/shared/plugin-read.ts (wave 13x round 16), the one file a plugin may
 * import, and are built here with those types.
 *
 * A PLUGIN'S OWN STORE, IF ONE IS ADDED LATER, IS NOT HERE. It would be new routes under a new path, and none of the
 * six shapes below would change. src/shared/plugins.ts says why a plugin writes nothing in v1, and that this is not
 * settled.
 */
import {
  checkSubtraction,
  NARROWED_BY_PERMISSION,
  type LeftOutCounts,
  type LeftOutGroup,
  type NarrowedByPermission,
  type PluginTalkBucket,
  type PluginTalkWithdrawalBucket,
} from '../../shared/disclosure.ts'
import type { PixelScale } from '../../shared/pixel-scale.ts'
import {
  PLUGIN_READ_INTERFACE,
  type PluginAsksTheSlot,
  type PluginLeftOutCounts,
  type PluginLeftOutGroup,
  type PluginOnlineView,
  type PluginParticipantRef,
  type PluginPeopleView,
  type PluginProjectsView,
  type PluginRosterView,
  type PluginScale,
  type PluginTalkView,
  type PluginWorkView,
} from '../../shared/plugin-read.ts'
import type { ParticipantRef } from '../../shared/participants.ts'
import { pluginAsksTheSlot } from '../../shared/plugins.ts'
import { everyPersonsName } from './participants.ts'
import { everyAgentOnTheRoster } from '../db/every-agent-on-the-roster.ts'
import { participantForActor } from './participant-for-actor.ts'
import { compareCommunicationPlaces, isAVisitor, readTheOffice, theNewestPermittedCommunication, thePermittedCommunicationsAtOrAfter, theReaderOfTheTalk, theTalkWithdrawals, theWholeTalk } from './pixel-office.ts'
import { whyReadingSomebodyElsesIsRefused } from '@shared/why-reading-somebody-elses-is-refused.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'

/*
 * THE PUBLISHED TYPES ARE THE OFFICE'S OWN, FIELD FOR FIELD. A plugin reads the views with the types in
 * src/shared/plugin-read.ts, which imports nothing, so that file cannot name the office's own types. Each line below
 * fails to compile when the office's type and the published one differ by a field, so neither can change alone.
 */
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const theScaleIsTheOfficesOwn: Same<PluginScale, PixelScale> = true
const theParticipantIsTheOfficesOwn: Same<PluginParticipantRef, ParticipantRef> = true
const theCountsAreTheOfficesOwn: Same<PluginLeftOutCounts, LeftOutCounts> = true
const theGroupIsTheOfficesOwn: Same<PluginLeftOutGroup<'message_limit'>, LeftOutGroup<PluginTalkBucket>> = true
const theWithdrawalGroupIsTheOfficesOwn: Same<PluginLeftOutGroup<'withdrawal_limit'>, LeftOutGroup<PluginTalkWithdrawalBucket>> = true
const theNarrowingIsTheOfficesOwn: Same<PluginLeftOutGroup[] | null, NarrowedByPermission> = true
const theAskIsTheSlotsSchema: Same<PluginAsksTheSlot, ReturnType<typeof pluginAsksTheSlot.parse>> = true

/** What a view is built as here: the reply hook adds `narrowedByPermission` (sayWhetherPermissionNarrowedIt, ./http.ts). */
type Built<V> = Omit<V, typeof NARROWED_BY_PERMISSION>

export function pluginProjectsView(): Built<PluginProjectsView> {
  return { interface: PLUGIN_READ_INTERFACE, view: 'projects', projects: listWorkspaces().map((p) => ({ id: p.id, name: p.title })) }
}

/**
 * The whole office, each part read only when a view asks for it. A view asked for a list of agents reads those agents
 * alone (wave 13y round 51), and `readTheOffice` says how that answers what the whole does.
 */
function theOfficeReadForAView(workspaceId: string, actor: Actor, asked: readonly string[] | undefined) {
  return readTheOffice(workspaceId, actor, 'office', asked)
}

/**
 * THE AGENTS A VIEW ANSWERS FOR: every one when `asked` is undefined, or those it names, in the order of `all`, with the
 * ids asked that no agent has in the order asked. `asked` holds each id once.
 */
function theAgentsAsked<A extends { id: string }>(all: readonly A[], asked: readonly string[] | undefined): { agents: readonly A[]; notAgents?: string[] } {
  if (asked === undefined) return { agents: all }
  const named = new Set(asked)
  const known = new Set(all.map((agent) => agent.id))
  return { agents: all.filter((agent) => named.has(agent.id)), notAgents: asked.filter((id) => !known.has(id)) }
}

/** Every person, as the people view and the roster carry them. */
function thePeople(): PluginPeopleView['people'] {
  return everyPersonsName().map((p) => ({ kind: 'person', id: p.id, handle: p.handle, name: p.name }))
}

/** `asked` is the agents ?agents= names, each once, or undefined for every agent. */
export function pluginPeopleView(workspaceId: string, actor: Actor, asked?: readonly string[]): Built<PluginPeopleView> {
  const people = thePeople()
  // NO AGENT ASKED, NO OFFICE READ.
  if (asked !== undefined && asked.length === 0) return { interface: PLUGIN_READ_INTERFACE, view: 'people', people, agents: [], notAgents: [] }
  const office = theOfficeReadForAView(workspaceId, actor, asked)
  const { agents, notAgents } = theAgentsAsked(office.agents(), asked)
  return {
    interface: PLUGIN_READ_INTERFACE,
    view: 'people',
    people,
    agents: agents.map((agent) => {
      const mole = office.whoOf(agent)
      return {
        kind: 'agent', id: mole.id, handle: mole.handle, name: mole.name, role: mole.role, retired: mole.retired,
        visitor: mole.zone === 'visitor', startedBy: mole.startedBy, createdAt: mole.createdAt,
        projects: office.projectsOf(agent).map((p) => p.id),
        appearance: mole.appearance, appearanceChosen: mole.appearanceChosen,
        // THE SCALE SAVED WHEN THE AGENT WAS REGISTERED, copied by field and never drawn again here (the plugin's gap G1, wave 13x round 16).
        scale: mole.scale === null ? null : { version: mole.scale.version, roleAtGeneration: mole.scale.roleAtGeneration, value: mole.scale.value },
        presence: office.presenceOf(agent).presenceByProject.map((p) => ({ project: p.workspaceId, colour: p.reading.colour, word: p.reading.word })),
      }
    }),
    ...(notAgents === undefined ? {} : { notAgents }),
  }
}

/** `asked` is the agents ?agents= names, each once, or undefined for every agent. */
export function pluginWorkView(workspaceId: string, actor: Actor, asked?: readonly string[]): Built<PluginWorkView> {
  if (asked !== undefined && asked.length === 0) return { interface: PLUGIN_READ_INTERFACE, view: 'work', work: [], notAgents: [] }
  const office = theOfficeReadForAView(workspaceId, actor, asked)
  const { agents, notAgents } = theAgentsAsked(office.agents(), asked)
  return {
    interface: PLUGIN_READ_INTERFACE,
    view: 'work',
    work: agents.flatMap((agent) =>
      office.workOf(agent).map((w) => ({
        id: w.id, project: w.workspaceId, agent: agent.id, title: w.title,
        detail: w.detail, recordedState: w.recordedState, doing: w.doing,
        executing: w.executing, association: w.association, updatedAt: w.updatedAt, runStanding: w.runStanding,
      })),
    ),
    ...(notAgents === undefined ? {} : { notAgents }),
  }
}

/** Who every person and every agent is, with the people view's values and in its order, and nothing worked out. */
export function pluginRosterView(): Built<PluginRosterView> {
  return {
    interface: PLUGIN_READ_INTERFACE,
    view: 'roster',
    people: thePeople(),
    agents: everyAgentOnTheRoster().map((agent) => ({
      kind: 'agent', id: agent.id, handle: agent.handle, name: agent.name, role: agent.role, retired: agent.retired,
      visitor: isAVisitor(agent), startedBy: agent.startedBy, createdAt: agent.createdAt,
    })),
  }
}

/**
 * Whether each agent on the roster is online, in the roster's order: its dot green in some project, or grey with the
 * words "In a terminal" (wave 13y round 66, item 2). `isThisAgentOnline` (./presence.ts) says how.
 */
export function pluginOnlineView(workspaceId: string, actor: Actor): Built<PluginOnlineView> {
  const office = theOfficeReadForAView(workspaceId, actor, undefined)
  return { interface: PLUGIN_READ_INTERFACE, view: 'online', agents: office.agents().map((agent) => ({ id: agent.id, online: office.onlineOf(agent) })) }
}

/** A place in the talk: the moment and the id of the last message read, so two messages sent in one moment are both seen. */
function theCursor(message: { at: string; id: string }): string {
  return `${message.at}~${message.id}`
}

/** Where a read of the talk begins: `start` or `after` for the messages, and `withdrawnAfter` for the withdrawals. */
export interface WhereTheTalkIsRead {
  start?: 'latest' | undefined
  after?: string | undefined
  withdrawnAfter?: string | undefined
}

export function pluginTalkView(actor: Actor, where: WhereTheTalkIsRead, limit: number): Built<PluginTalkView> {
  const { start, withdrawnAfter } = where
  if (start !== undefined && (where.after !== undefined || withdrawnAfter !== undefined)) {
    throw new PanelError(
      'start=latest is where a first read begins, and after and withdrawnAfter are where an earlier read ended. Give ' +
        'start=latest alone, and the places from its answer on every read after it.',
      400,
    )
  }
  if (where.after !== undefined && !/^[^~]+~[^~]+$/.test(where.after)) {
    throw new PanelError(`after is the "last" of an earlier answer, such as "2026-10-11T20:00:00.000Z~abc", and "${where.after}" is not one.`, 400)
  }
  if (withdrawnAfter !== undefined && !/^\d{1,15}$/.test(withdrawnAfter)) {
    throw new PanelError(`withdrawnAfter is the "withdrawn.last" of an earlier answer, a whole number, and "${withdrawnAfter}" is not one.`, 400)
  }
  const caller = participantForActor(actor)
  const refusal = whyReadingSomebodyElsesIsRefused(caller)
  const projects = listWorkspaces()
  // THE CALLER'S OWN LIST IS READ ONCE FOR THE WHOLE ANSWER (wave 13y round 78), for its messages and its withdrawals.
  const reader = theReaderOfTheTalk(caller, refusal)
  const all = start === 'latest' ? [] : where.after === undefined
    ? theWholeTalk(projects, reader)
    : thePermittedCommunicationsAtOrAfter(projects, reader, where.after.split('~')[0]!)
  // START=LATEST READS AS `after` AT THE NEWEST MESSAGE THIS CALLER MAY READ WOULD (gap G7): no message, and
  // that place to read on from. With no message at all it reads from the start, which holds nothing.
  const newest = start === 'latest' ? theNewestPermittedCommunication(projects, reader) : undefined
  const after = start === 'latest' ? (newest === undefined ? undefined : theCursor(newest)) : where.after
  // COMPARED AS theWholeTalk SORTS: by the moment, then by the id.
  const [afterAt, afterId] = after === undefined ? ['', ''] : (after.split('~') as [string, string])
  const later = after === undefined ? all : all.filter((m) => compareCommunicationPlaces(m, { at: afterAt, id: afterId }) > 0)
  const held = later.slice(0, limit)
  const end = held.at(-1)
  // THE CANDIDATES ARE THE MESSAGES AFTER `after`. The ones before it are the caller's own question, read already.
  const leftOutGroups: LeftOutGroup<PluginTalkBucket>[] = [
    { cause: 'budget', bucket: 'message_limit', count: later.length - held.length, ids: later.slice(held.length).map((m) => m.id) },
  ]
  const subtraction: LeftOutCounts = { candidates: later.length, carried: held.length, leftOut: later.length - held.length, shortened: 0 }
  checkSubtraction('the plugin talk view', subtraction, leftOutGroups)
  return {
    interface: PLUGIN_READ_INTERFACE,
    view: 'talk',
    messages: held.map((m) => ({ id: m.id, project: m.workspaceId, at: m.at, from: m.from, to: [...m.to] })),
    last: end !== undefined ? theCursor(end) : (after ?? null),
    more: later.length > held.length,
    subtraction,
    leftOutGroups,
    refusal,
    withdrawn: theWithdrawals(theTalkWithdrawals(projects, reader, withdrawnAfter === undefined ? undefined : Number(withdrawnAfter)), withdrawnAfter, limit),
  }
}

/**
 * THE WITHDRAWALS AFTER `withdrawnAfter`, AT MOST `limit` OF THEM (gap G9). A place is the append order of the
 * change row of a withdrawal (withdrawnMessagePool in src/server/lib/messages.ts), so no two share one. Without
 * `withdrawnAfter` none is named, because every message withdrawn before this read is already not among the messages,
 * and `last` is the place of the newest withdrawal this caller may know of, or 0, which is before every one. It is not
 * the newest place in the change log, which moves with every write in the office and would leave no answer unchanged.
 *
 * ITS OWN COUNTS, AS THE MESSAGES HAVE THEIRS (wave 13x round 17e). The candidates are the withdrawals after
 * `withdrawnAfter`, so a read without it has none, and the group names by id each one the limit left out.
 */
function theWithdrawals(withdrawals: readonly { id: string; order: number }[], withdrawnAfter: string | undefined, limit: number): PluginTalkView['withdrawn'] {
  const since = withdrawnAfter === undefined ? undefined : Number(withdrawnAfter)
  const later = since === undefined ? [] : withdrawals.filter((one) => one.order > since)
  const held = later.slice(0, limit)
  const leftOutGroups: LeftOutGroup<PluginTalkWithdrawalBucket>[] = [
    { cause: 'budget', bucket: 'withdrawal_limit', count: later.length - held.length, ids: later.slice(held.length).map((one) => one.id) },
  ]
  const subtraction: LeftOutCounts = { candidates: later.length, carried: held.length, leftOut: later.length - held.length, shortened: 0 }
  checkSubtraction('the withdrawals on the plugin talk view', subtraction, leftOutGroups)
  return {
    ids: held.map((one) => one.id),
    last: String(since === undefined ? (withdrawals.at(-1)?.order ?? 0) : (held.at(-1)?.order ?? since)),
    more: later.length > held.length,
    subtraction,
    leftOutGroups,
  }
}
