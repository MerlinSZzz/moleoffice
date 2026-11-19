// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT AN AGENT IS CALLED, from the id a comment or a run is addressed to.
 *
 * A comment stores WHO it is for as an id — a run's session record, or a durable agent's record.
 * That is right: the id is the identity and the title is presentation, and a title can be changed
 * after the comment was written. But an id is not something a person reads, so every surface that
 * draws a recipient needs the title, and asking once per comment would be a request per row.
 *
 * So this reads the records named by the ids the open thread draws, in one narrow read, and answers
 * from those. An id that is in neither is a real answer and it is said out loud rather than printed
 * raw: the run or the agent has been deleted, or it belongs to another project, and either way Mole
 * Office cannot name it here.
 *
 * BOTH KINDS, BECAUSE AN AGENT IS NOT A RUN. This read the runs alone until 25 August 2026, and a
 * message addressed to a durable agent drew "an agent that is not filed in this project any more" —
 * a true sentence about the wrong list. A run ends and the identity it ran as does not, which is the
 * whole reason `agent` is a record kind.
 */

import { api } from '../../api.ts'
import { type AsyncState } from '../ui.tsx'
import { useProjectAsync } from '../../lib/project-async.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { RecipientView, ThreadDetail } from '../../../server/lib/agents.ts'

export type AgentNames = AsyncState<PanelRecord[]>

/**
 * THE IDS ONE OPEN THREAD CAN NAME: every message's recipient, every run's recipient session, and
 * the run the reply box goes back to. A set, because the same run is often both a message's
 * recipient and the run that answered it.
 */
export function idsTheThreadNames(thread: ThreadDetail | null): string[] {
  if (thread === null) return []
  const ids = new Set<string>()
  const add = (id: string | null): void => {
    if (id !== null) ids.add(id)
  }
  for (const message of thread.messages) {
    add(message.recipient?.sessionId ?? null)
    add(message.recipient?.agentId ?? null)
  }
  for (const run of thread.runs) add(run.recipientSessionId)
  // THE REPLY BOX'S TARGET IS THE LAST AGENT ANSWER'S RUN, the same choice `ReplyBox` makes.
  const answered = [...thread.messages].reverse().find((one) => one.runId !== null) ?? null
  add(answered === null ? null : (thread.runs.find((one) => one.id === answered.runId)?.recipientSessionId ?? null))
  return [...ids]
}

/** The names of exactly these ids, in one narrow read; no ids asks nothing. */
export async function readAgentNames(ids: readonly string[]): Promise<PanelRecord[]> {
  if (ids.length === 0) return []
  return (await api.recordsNamed([...new Set(ids)])).records
}

/**
 * The names of the records the open thread draws. The narrow shape, which a decision asks for:
 * `agentName` below reads the title and nothing else, and the ids keep the read to the thread's
 * own rows rather than every run and agent ever filed in the project.
 */
export function useAgentNames(ids: readonly string[], deps: React.DependencyList = []): AgentNames {
  const key = ids.join(',')
  return useProjectAsync(() => readAgentNames(ids), [key, ...deps])[0]
}

/** What an id that names no agent filed here is called. Exported so that a test reads it (round 132). */
export const AN_AGENT_NO_LONGER_FILED = 'an agent no longer filed in this project'

/**
 * What to call the agent with this id.
 *
 * Three answers and they are different. The title, when Mole Office holds the run or the agent. A plain
 * sentence while the names are still being read, because a blank would read as "nobody". And a plain
 * sentence when the id names nothing here, which is a fact worth showing rather than an id worth
 * printing.
 */
export function agentName(names: AgentNames, id: string | null): string {
  if (id === null) return 'a new agent'
  if (names.status !== 'ready') return 'the agent this is addressed to'
  const found = names.value.find((record) => record.id === id)
  return found === undefined ? AN_AGENT_NO_LONGER_FILED : found.title
}

/**
 * WHAT TO CALL WHOEVER A MESSAGE IS FOR, from the recipient as the server serves it.
 *
 * EXACTLY ONE OF THE TWO IDS IS EVER FILLED and `kind` says which — a durable agent under `agentId`,
 * a run under `sessionId`, and neither for `new`. Reading one field and ignoring the other is how a
 * durable agent came to be drawn as "a new agent"; this is the one place that choice is made, so no
 * surface has to remember which field to read.
 *
 * Exported so a test can put every kind to it without a browser.
 */
export function nameOfWhoever(names: AgentNames, recipient: Pick<RecipientView, 'kind' | 'sessionId' | 'agentId'>): string {
  if (recipient.kind === 'agent') return agentName(names, recipient.agentId)
  if (recipient.kind === 'session') return agentName(names, recipient.sessionId)
  // `new` is a deliberately fresh agent and names nothing; `unresolved` is words that named more
  // than one agent or none, and every surface says that in its own sentence before reaching here.
  return agentName(names, null)
}
