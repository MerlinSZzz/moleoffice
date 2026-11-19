// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S RENAMES, AS THE DOORS SEND THEM. Item 42 of wave 13s. The rules are in src/server/lib/agent-renames.ts; the
 * table is agent_renames (migrations 0319 and 0321). The agent's page and an approver's reading take these shapes.
 */
import type { ParticipantRef } from './participants.ts'

/** 'proposed': it waited for an approver. 'at once': the person renamed the agent through the participants PATCH door. */
export type RenameWay = 'proposed' | 'at once'

export type RenameAnswer = 'approved' | 'refused'

/** WHY AN AGENT MAY NOT ANSWER ITS OWN NEW NAME: the sentence the reading of its renames and the refusal both carry. */
export const AN_AGENT_NEVER_ANSWERS_ITS_OWN_NEW_NAME = 'An agent never approves or refuses its own new name.'

/**
 * WHO MAY ANSWER A NEW NAME THAT WAITS FOR THE PERSON: the sentence the reading of its renames and the refusal both
 * carry, to a caller that is neither the person nor a secretary the person has raised.
 */
export const A_NEW_NAME_THE_PERSON_ANSWERS =
  'This new name waits for the person. Only the person, or a secretary the person has raised, approves or refuses it, by its own key.'

/**
 * WHY THE OFFICE MARKED THE PERSON'S LINE ABOUT A NEW NAME READ: the end of the sentence `theOfficeMarkedItRead` in
 * shared/messages.ts begins. `by` is the name of who answered, and `at` the stamp of the answer.
 */
export function theNewNameWasAnswered(newName: string, answer: RenameAnswer, by: string, at: string): string {
  return `the new name it asks about, "${newName}", was ${answer} by "${by}" at ${at}.`
}

/** A participant on a rename row, with the name it bears now, or its id where nothing answers to it any more. */
export type ANamedParticipant = ParticipantRef & { name: string }

/** One row of agent_renames. Its times are local stamps, as the office writes them. */
export interface ARename {
  id: string
  agent: string
  way: RenameWay
  oldName: string
  newName: string
  proposedBy: ANamedParticipant
  /** The proposer's reason. Null only on an 'at once' row whose person gave none. */
  proposedBecause: string | null
  proposedAt: string
  /** Who the proposal waits for, or waited for: the first secretary up the agent's chain of starters, or the person. */
  approver: ANamedParticipant
  /** The message that told the approver, or null because nobody was told: the proposer was the approver, or the row is 'at once'. */
  toldMessage: string | null
  /** Null while the proposal waits. */
  answer: RenameAnswer | null
  answeredBy: ANamedParticipant | null
  answeredBecause: string | null
  answeredAt: string | null
  /**
   * The grant a secretary the person raised answered under, or null: the person answered, the approver answered in its
   * own right, the new name still waits, or the row was written before a raise could answer one.
   */
  answeredUnderTheGrant: string | null
}

/** GET /api/participants/agent/:id/renames. */
export interface TheRenamesOfAnAgent {
  agent: string
  /** Newest first. Empty because the agent was never renamed and nothing was ever proposed for it. */
  renames: ARename[]
  /**
   * The proposal that waits, if one does, and whether the caller may answer it: null when it may, and otherwise the
   * sentence that says who may.
   */
  waiting: { rename: string; whyTheCallerMayNotAnswer: string | null } | null
}

/** POST /api/participants/agent/:id/renames. `says` names the approver and whether it was told. */
export interface TheProposedRename {
  rename: ARename
  says: string
}

/** POST /api/renames/:id/approve and /refuse. */
export interface TheAnsweredRename {
  rename: ARename
}
