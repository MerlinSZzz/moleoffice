// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S NEW NAME TAKES EFFECT WHEN ITS APPROVER APPROVES IT. Item 42 of wave 13s, round 192.
 *
 * THE NAME IS THE DISPLAY NAME. The handle and the id never change. A message, a starter and every
 * door name an agent by its id or its handle (lib/agent-references.ts), so a message sent the way it was sent before the
 * rename still reaches the agent.
 *
 * WHO PROPOSES. The agent itself or an agent up its chain of starters, each proved by its own key, or the person. Every
 * proposal names its reason.
 *
 * WHO APPROVES. The first secretary up the agent's chain of starters, read with the same walk a message routed up the
 * chain takes (`theRungsOfTheRoutingWalk` in lib/superiors.ts), so there is no second list of superiors. A secretary's
 * new name, and the new name of an agent with no live secretary above it, waits for the person. The person may approve
 * or refuse any. The approver is read when the proposal is made and kept on the row, so the one told is the one who may
 * answer. An agent never approves or refuses its own new name, raised or not. Every answer names its reason.
 *
 * A SECRETARY THE PERSON HAS RAISED MAY ANSWER A NEW NAME THAT WAITS FOR THE PERSON, by its own key. A raise carries
 * the person's acts but three: closing the key window, changing the regulations and changing who the owner is.
 * Answering a new name is not one of them. The raise is asked through the office's one check
 * (`aRaiseCarriesIt` in lib/records/own-words.ts), so a secretary card or an office list that keeps a door for the
 * person still keeps it, and the press gives its reason in `forThePerson`. Every act under a raise is recorded as done
 * under it, so the rename row keeps the grant beside the secretary that answered. A new name that waits for a secretary
 * is answered by that secretary or the person, as before.
 *
 * ONE ROW PER RENAME, in agent_renames: who proposed, who approved or refused, the old and the new name, and both
 * reasons. A refusal is a row too. The person's own rename through the participants PATCH door is a row of the way
 * 'at once', written by `writeThePersonsOwnRename` in lib/agent-names.ts.
 *
 * TWO LIVE AGENTS NEVER SHARE ONE NAME. The rule is `whyALiveAgentBearsThisName` in lib/agent-names.ts. It is asked when
 * a name is proposed, so a proposal that could never be approved is refused at once, and again when it is approved,
 * because another agent may have taken the name in between.
 */
import { sqlite } from '../db/client.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice, whyNameIsRefused, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { nowStamp } from '@shared/time.ts'
import {
  AN_AGENT_NEVER_ANSWERS_ITS_OWN_NEW_NAME,
  A_NEW_NAME_THE_PERSON_ANSWERS,
  theNewNameWasAnswered,
  type ANamedParticipant,
  type ARename,
  type RenameAnswer,
  type RenameWay,
  type TheRenamesOfAnAgent,
} from '@shared/agent-renames.ts'
import { whyALiveAgentBearsThisName } from '../db/why-a-live-agent-bears-this-name.ts'
import { announce } from './events.ts'
import { writeASystemLineToOne } from './groups.ts'
import { anOfficeId } from './ids.ts'
import { markReadByTheOffice } from './messages.ts'
import { type RegisteredAgent } from './participants.ts'
import { theChainUpWith } from '@shared/the-chain-up-with.ts'
import { theStarterEachStringNames } from './the-starter-each-string-names.ts'
import { readParticipant } from '../db/read-participant.ts'
import { aRaiseCarriesIt, mayPressForThePerson, type Actor } from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { theRoleCardsAreRead } from './roles.ts'
import { theRungsOfTheRoutingWalk } from './superiors.ts'
import { theNameOf } from '@shared/participant-name.ts'
import { anAgentItsOwnKeyProves } from './who-may-act.ts'

/**
 * THE OWNER, READ EACH TIME IT IS ASKED FOR. A new office is told its owner by the migrate, and the start loads this file
 * before that. A copy made when this file loads would name nobody in a new office.
 */
const theOwner = (): ParticipantRef => ({ kind: 'person', id: THE_PERSON })

/** The lead a line to the person carries: the agent's page, where the person's two presses are. Chapter 10 rule 4. */
function aLeadToTheAgentsPage(agentId: string): { target: { kind: 'page'; route: string } } {
  return { target: { kind: 'page', route: `/who/agent/${encodeURIComponent(agentId)}` } }
}

interface ARenameRow {
  id: string
  agent_id: string
  way: RenameWay
  old_name: string
  new_name: string
  proposed_by_kind: 'person' | 'agent'
  proposed_by_id: string
  proposed_because: string | null
  proposed_at: string
  approver_kind: 'person' | 'agent'
  approver_id: string
  told_message_id: string | null
  answer: RenameAnswer | null
  answered_by_kind: 'person' | 'agent' | null
  answered_by_id: string | null
  answered_because: string | null
  answered_at: string | null
  answered_under_grant: string | null
}

function named(who: ParticipantRef): ANamedParticipant {
  return { ...who, name: theNameOf(readParticipant(who), who.id) }
}

function onTheWire(row: ARenameRow): ARename {
  return {
    id: row.id,
    agent: row.agent_id,
    way: row.way,
    oldName: row.old_name,
    newName: row.new_name,
    proposedBy: named({ kind: row.proposed_by_kind, id: row.proposed_by_id }),
    proposedBecause: row.proposed_because,
    proposedAt: row.proposed_at,
    approver: named({ kind: row.approver_kind, id: row.approver_id }),
    toldMessage: row.told_message_id,
    answer: row.answer,
    answeredBy: row.answered_by_kind === null || row.answered_by_id === null ? null : named({ kind: row.answered_by_kind, id: row.answered_by_id }),
    answeredBecause: row.answered_because,
    answeredAt: row.answered_at,
    answeredUnderTheGrant: row.answered_under_grant,
  }
}

function theRow(renameId: string): ARenameRow | null {
  return (sqlite.prepare('SELECT * FROM agent_renames WHERE id = ?').get(renameId) as ARenameRow | undefined) ?? null
}

function theAgentOrARefusal(agentId: string): RegisteredAgent {
  const row = readParticipant({ kind: 'agent', id: agentId }) as RegisteredAgent | null
  if (row === null) throw new PanelError(`No agent in this installation answers to "${agentId}". Nothing was written.`, 404)
  return row
}

/** A reason as it is stored, or the refusal of one that says nothing. */
function aReason(because: string, whose: string): string {
  const said = because.trim()
  if (said === '') throw new PanelError(`${whose} names its reason, and this one is empty. Nothing was written.`, 400)
  return said
}

/**
 * WHO A NEW NAME FOR THIS AGENT WAITS FOR: the first secretary up its chain of starters, or the person.
 *
 * The walk is the one a message routed up the chain takes. It stops at the first agent holding the secretary card, and
 * a secretary starts no walk, so a secretary's own new name waits for the person. A walk that meets no secretary ends
 * at the person, and so does one whose first secretary is retired: a retired agent answers nothing.
 *
 * WHICH AGENT HOLDS THE SECRETARY CARD IS READ FROM THE ROLE CARDS. Before they are read, every agent would look like no
 * secretary, and the proposal would wait for the person without saying why, so this refuses instead.
 */
export function theApproverOf(agentId: string): ParticipantRef {
  if (!theRoleCardsAreRead()) {
    throw new PanelError(
      'The office has not read its role cards, so it cannot tell which agent holds the secretary card, and so who ' +
        'approves this new name. Nothing was written.',
      503,
    )
  }
  const walk = theRungsOfTheRoutingWalk({ kind: 'agent', id: agentId }, theStarterEachStringNames())
  const last = walk.rungs.at(-1)
  if (walk.ending.how === 'nobody reachable' && last !== undefined && last.row.retired !== true) {
    return { kind: 'agent', id: last.row.id }
  }
  return theOwner()
}

/**
 * WHO IS PROPOSING, or the refusal. The person, proved; the agent itself, by its own key; or an agent up its chain of
 * starters, by its own key.
 */
function theProposer(agent: RegisteredAgent, actor: Actor): ParticipantRef {
  if (thePersonIsProved(actor)) return theOwner()
  const keyed = anAgentItsOwnKeyProves(actor)
  if (keyed === agent.id) return { kind: 'agent', id: keyed }
  if (keyed !== null) {
    const chain = theChainUpWith(agent.startedBy, theStarterEachStringNames()).chain
    if (chain.some((one) => one.kind === 'agent' && one.id === keyed)) return { kind: 'agent', id: keyed }
  }
  throw new PanelError(
    `A new name for "${agent.name}" is proposed by the agent itself, by an agent up its chain of starters, or by the ` +
      'person. An agent is proved by its own key. This request was none of them. Nothing was written.',
    403,
  )
}

/**
 * WHAT THE RAISE SAYS OF THIS CALLER ANSWERING A NEW NAME THAT WAITS FOR THE PERSON: null because it carries the answer,
 * the check's own sentence because the caller holds the grant and the check refuses this press, or undefined because the
 * caller holds no grant this request may use.
 */
type WhatTheRaiseSays = (actor: Actor) => string | null | undefined

/**
 * AT THE TWO DOORS, the check that marks the act as done under the grant. It refuses in its own words where the grant
 * does not press the door or the press gave no reason.
 */
const atTheDoor: WhatTheRaiseSays = (actor) => (aRaiseCarriesIt(actor) ? null : undefined)

/** The two doors that answer a new name, as their routes declare them. */
const THE_ANSWERING_DOORS = ['agent-rename.approve', 'agent-rename.refuse'] as const

/**
 * ON THE READING, the same check for each of the two doors, as if the caller pressed it, and nothing is marked. The
 * reason is not asked, because the press gives it. No grant and a run are what `aRaiseCarriesIt` answers false for, so
 * the reading then gives the door's own sentence too.
 */
const onTheReading: WhatTheRaiseSays = (actor) => {
  for (const operation of THE_ANSWERING_DOORS) {
    const said = mayPressForThePerson({ ...actor, press: { operation, aRead: false, reason: null } }, false)
    if (!said.may) return said.because === 'no grant' || said.because === 'a run' ? undefined : said.why
  }
  return null
}

/**
 * WHY THIS CALLER MAY NOT APPROVE OR REFUSE THIS WAITING NEW NAME, or null because it may. The person may answer any.
 * The approver kept on the row may answer it, proved by its own key. The agent being renamed never may, raised or not.
 * A secretary the person has raised may answer a new name that waits for the person, by its own key, where the raise
 * carries the press.
 */
function whyTheCallerMayNotAnswer(row: ARenameRow, actor: Actor, theRaise: WhatTheRaiseSays): string | null {
  if (thePersonIsProved(actor)) return null
  const keyed = anAgentItsOwnKeyProves(actor)
  if (keyed !== null && keyed === row.agent_id) {
    return AN_AGENT_NEVER_ANSWERS_ITS_OWN_NEW_NAME
  }
  if (keyed !== null && row.approver_kind === 'agent' && row.approver_id === keyed) return null
  if (row.approver_kind === 'person') {
    const raised = keyed === null ? undefined : theRaise(actor)
    return raised === undefined ? A_NEW_NAME_THE_PERSON_ANSWERS : raised
  }
  const approver = named({ kind: row.approver_kind, id: row.approver_id })
  return `This new name waits for "${approver.name}". Only that secretary, proved by its own key, or the person approves or refuses it.`
}

/**
 * PROPOSE A NEW NAME FOR AN AGENT. It waits for its approver, who is told once, by a line in the same write. A proposer
 * who is the approver is not told its own words; the reply says so.
 */
export function proposeARename(
  agentId: string,
  asked: { name: string; because: string },
  actor: Actor,
  workspaceId: string,
): { rename: ARename; says: string } {
  return sqlite.transaction(() => {
    const agent = theAgentOrARefusal(agentId)
    if (agent.retired === true) {
      throw new PanelError(`"${agent.name}" is retired, and a retired agent is not given a new name. Nothing was written.`, 409)
    }
    const proposer = theProposer(agent, actor)
    const because = aReason(asked.because, 'A proposal for a new name')
    const refused = whyNameIsRefused(asked.name)
    if (refused !== null) throw new PanelError(`${refused} Nothing was written.`, 400)
    const newName = asked.name.trim()
    if (newName === agent.name) {
      throw new PanelError(`"${agent.name}" already bears the name "${newName}". Nothing was written.`, 400)
    }
    const taken = whyALiveAgentBearsThisName(newName, agent.id)
    if (taken !== null) throw new PanelError(`${taken} Nothing was written.`, 409)
    const waiting = sqlite
      .prepare('SELECT id, new_name FROM agent_renames WHERE agent_id = ? AND answer IS NULL')
      .get(agent.id) as { id: string; new_name: string } | undefined
    if (waiting !== undefined) {
      throw new PanelError(
        `The new name "${waiting.new_name}" already waits for its approver (rename ${waiting.id}). One new name waits at a ` +
          'time, so that one is approved or refused first. Nothing was written.',
        409,
      )
    }
    const approver = theApproverOf(agent.id)
    const id = anOfficeId()
    sqlite
      .prepare(
        'INSERT INTO agent_renames (id, agent_id, way, old_name, new_name, proposed_by_kind, proposed_by_id, ' +
          "proposed_because, proposed_at, approver_kind, approver_id) VALUES (?, ?, 'proposed', ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, agent.id, agent.name, newName, proposer.kind, proposer.id, because, nowStamp(), approver.kind, approver.id)
    const approverName = named(approver).name
    // THE APPROVER IS TOLD ONCE, AS THE LAST STEP, so a refusal above writes no line about a proposal that is not there.
    if (approver.kind === proposer.kind && approver.id === proposer.id) {
      return {
        rename: onTheWire(theRow(id)!),
        says: `The new name waits for its approver, "${approverName}", who proposed it. Nobody was told.`,
      }
    }
    const toAPerson = approver.kind === 'person'
    const told = writeASystemLineToOne(
      approver,
      workspaceId,
      SYSTEM_LINES.aRenameWaitsForYou(id, agent.name, newName, named(proposer).name, because, toAPerson),
      { type: 'system', id: moleOffice().id },
      undefined,
      undefined,
      toAPerson ? aLeadToTheAgentsPage(agent.id) : undefined,
    )
    sqlite.prepare('UPDATE agent_renames SET told_message_id = ? WHERE id = ?').run(told.id, id)
    return {
      rename: onTheWire(theRow(id)!),
      says: `The new name waits for its approver, "${approverName}", who was told in message ${told.id}.`,
    }
  })()
}

function answerARename(renameId: string, answer: RenameAnswer, said: string, actor: Actor): { rename: ARename } {
  return sqlite.transaction(() => {
    const row = theRow(renameId)
    if (row === null) throw new PanelError(`No rename in this installation has the id "${renameId}". Nothing was written.`, 404)
    if (row.answer !== null) {
      const by = row.answered_by_kind === null || row.answered_by_id === null ? null : named({ kind: row.answered_by_kind, id: row.answered_by_id })
      throw new PanelError(
        `This new name was already ${row.answer} by "${by?.name ?? 'nobody recorded'}" at ${row.answered_at ?? 'a time nobody recorded'}. ` +
          'Nothing was written.',
        409,
      )
    }
    const not = whyTheCallerMayNotAnswer(row, actor, atTheDoor)
    if (not !== null) throw new PanelError(`${not} Nothing was written.`, 403)
    const because = aReason(said, answer === 'approved' ? 'An approval' : 'A refusal')
    const by: ParticipantRef = thePersonIsProved(actor) ? theOwner() : { kind: 'agent', id: anAgentItsOwnKeyProves(actor)! }
    // THE GRANT IS KEPT ONLY WHERE THE RAISE WAS WHAT LET THE SECRETARY ANSWER. `aRaiseCarriesIt` marks the actor only
    // then, as every ledger row names a grant only then.
    const underTheGrant = by.kind === 'agent' && actor.elevationUsed === true && actor.elevation !== undefined ? actor.elevation.id : null
    if (answer === 'approved') {
      const agent = theAgentOrARefusal(row.agent_id)
      if (agent.retired === true) {
        throw new PanelError(`"${agent.name}" is retired, and a retired agent is not given a new name. Nothing was written.`, 409)
      }
      if (agent.name !== row.old_name) {
        throw new PanelError(
          `The agent's name is now "${agent.name}", and this new name was proposed in place of "${row.old_name}". Refuse ` +
            'this one and propose again. Nothing was written.',
          409,
        )
      }
      const taken = whyALiveAgentBearsThisName(row.new_name, row.agent_id)
      if (taken !== null) throw new PanelError(`${taken} Nothing was written.`, 409)
      sqlite.prepare('UPDATE agents SET name = ? WHERE id = ?').run(row.new_name, row.agent_id)
      // EVERY PAGE IS TOLD, because the chat's lists draw an agent by its name.
      announce({
        name: 'list.changed',
        workspaceId: null,
        lists: ['participants', 'contacts'],
        about: null,
        groupId: null,
        participant: { kind: 'agent', id: row.agent_id },
        because: `The agent "${row.old_name}" was given the new name "${row.new_name}", so the registry of agents changed.`,
      })
    }
    const at = nowStamp()
    sqlite
      .prepare(
        'UPDATE agent_renames SET answer = ?, answered_by_kind = ?, answered_by_id = ?, answered_because = ?, answered_at = ?, ' +
          'answered_under_grant = ? WHERE id = ? AND answer IS NULL',
      )
      .run(answer, by.kind, by.id, because, at, underTheGrant, row.id)
    // THE PERSON'S LINE ABOUT THIS NEW NAME ENDS WITH IT, whichever door answered, so its offer neither stays nor comes
    // back after Not now: the rename's own notice ends with the matter it names. A secretary's line is left as it is.
    if (row.approver_kind === 'person' && row.told_message_id !== null) {
      markReadByTheOffice(
        row.told_message_id,
        { kind: 'person', id: row.approver_id },
        theNewNameWasAnswered(row.new_name, answer, named(by).name, at),
        at,
      )
    }
    return { rename: onTheWire(theRow(row.id)!) }
  })()
}

/** APPROVE A WAITING NEW NAME, with a reason. The agent bears it from this write on. */
export function approveARename(renameId: string, because: string, actor: Actor): { rename: ARename } {
  return answerARename(renameId, 'approved', because, actor)
}

/** REFUSE A WAITING NEW NAME, with a reason. The agent keeps its name, and the refusal is kept as a row. */
export function refuseARename(renameId: string, because: string, actor: Actor): { rename: ARename } {
  return answerARename(renameId, 'refused', because, actor)
}

/** EVERY RENAME OF ONE AGENT, newest first, and whether this caller may answer the one that waits. It marks nothing. */
export function theRenamesOf(agentId: string, actor: Actor): TheRenamesOfAnAgent {
  theAgentOrARefusal(agentId)
  const rows = sqlite
    .prepare('SELECT * FROM agent_renames WHERE agent_id = ? ORDER BY proposed_at DESC, rowid DESC')
    .all(agentId) as ARenameRow[]
  const waiting = rows.find((row) => row.answer === null)
  return {
    agent: agentId,
    renames: rows.map(onTheWire),
    waiting: waiting === undefined ? null : { rename: waiting.id, whyTheCallerMayNotAnswer: whyTheCallerMayNotAnswer(waiting, actor, onTheReading) },
  }
}
