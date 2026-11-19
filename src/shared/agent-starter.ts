// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO ANSWERS FOR AN AGENT, AS THE DOORS SEND IT. Wave 13u, round 186. The rules are in src/server/lib/agent-starter.ts;
 * the history is the table agent_starter_changes (migration 0331). The agent's page reads these shapes.
 */
import type { ANamedParticipant } from './agent-renames.ts'

/**
 * 'applied': the registry row and the agent's records name the new starter. 'waiting' waits for live runs to end;
 * 'withdrawn' was taken back by the person; 'refused' could no longer be applied.
 */
export type StarterChangeState = 'waiting' | 'applied' | 'withdrawn' | 'refused'

/** One row of agent_starter_changes. Its times are local stamps, as the office writes them. */
export interface AStarterChange {
  id: string
  agent: string
  /** The starter before the change, or null because the row had none. */
  from: ANamedParticipant | null
  to: ANamedParticipant
  /** Who pressed: the person, or inside a test world an agent that holds the person's authority there. */
  askedBy: ANamedParticipant
  because: string
  askedAt: string
  state: StarterChangeState
  appliedAt: string | null
  refusedBecause: string | null
  /** The agent's runs that had not ended when the change was requested, by id. */
  runsNotEnded: string[]
}

/** One of the agent's runs that has not ended, in whichever project it was filed. */
export interface ARunNotEnded {
  id: string
  title: string
  project: string
  /** The run's state as it is stored, or null because none is stored. */
  state: string | null
}

/** Who answers for an agent now, and every change of it, newest first. */
export interface WhoAnswersForAnAgent {
  agent: { id: string; handle: string; name: string }
  /** The starter on the registry row, or null because nobody recorded one. */
  starter: ANamedParticipant | null
  /** Whether following the starters up from the agent reaches the person, and the sentence that says how. */
  reachesThePerson: boolean
  chainSays: string
  changes: AStarterChange[]
}

/** How the new starter that was asked for was read. */
export type HowTheNewStarterWasRead = 'the person' | 'an agent by its id' | 'the one live agent with this handle'

/** What a change of starter does, or would do. A preview and a press answer the same shape. */
export interface AStarterMove {
  agent: { id: string; handle: string; name: string }
  dryRun: boolean
  from: ANamedParticipant | null
  to: ANamedParticipant
  toWasReadAs: HowTheNewStarterWasRead
  /** Whether the agent holds the secretary card. A secretary may be moved; the page says so before the press. */
  isASecretary: boolean
  /** How many live agents have this agent on their chain of starters. They follow it to the new starter. */
  agentsBelow: number
  /**
   * The first agent up the agent's chain of starters that holds the secretary card, before and after, or null where
   * there is none. A letter the agent cannot deliver goes to that secretary, so a change here changes where it goes.
   */
  firstSecretaryUp: { before: ANamedParticipant | null; after: ANamedParticipant | null }
  /** The agent's runs that have not ended. A press with any waits unless it says `atOnce`. */
  runsNotEnded: ARunNotEnded[]
  /** The agent's records, in every project, whose `startedBy` the press writes. */
  records: { id: string; project: string }[]
  /** The change the press wrote, or null on a preview. */
  change: AStarterChange | null
  /** Each agent the press told, with the message. Empty on a preview. */
  told: { who: ANamedParticipant; message: string }[]
  note: string
}
