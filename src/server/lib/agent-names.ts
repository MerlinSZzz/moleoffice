// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO LIVE AGENTS NEVER SHARE ONE NAME, AND THE PERSON'S OWN RENAME OF AN AGENT LEAVES ONE ROW. Item 42 of wave 13s.
 *
 * The name is the display name lists and pages show. It is not an address: a message, a starter and every door name
 * an agent by its id or its handle (lib/agent-references.ts), and neither changes when the name does.
 *
 * THIS FILE IMPORTS NOTHING FROM lib/participants.ts, because lib/participants.ts imports it: `setParticipantName` asks
 * the name rule below and writes the person's row through `writeThePersonsOwnRename`. A rename proposed and approved
 * is in lib/agent-renames.ts, which asks the same rule here.
 *
 * THE RULE IS ASKED AT THE TWO DOORS THAT CHANGE A NAME: an approval of a rename, and the person's PATCH. A
 * registration takes its name from its record's title and is not refused over a name. A retired
 * agent's name may be borne again.
 */
import { sqlite } from '../db/client.ts'
import { giveTheFill } from '../db/part-tables.ts'
import { anOfficeId } from './ids.ts'
import { nowStamp } from '@shared/time.ts'
import { isMoleOffice, type ParticipantRef } from '@shared/participants.ts'

export { theNameAsCompared } from '../db/why-a-live-agent-bears-this-name.ts'

export { whyALiveAgentBearsThisName } from '../db/why-a-live-agent-bears-this-name.ts'

export { writeThePersonsOwnRename } from './write-the-persons-own-rename.ts'

/**
 * THE RESTORE PROOF'S RENAMES, written by the product's own writers: the person renames one live agent at once, with a
 * reason, and then proposes another new name for it and refuses it. So the proof carries both ways and both answers.
 *
 * THE AGENT IS THE FIRST LIVE ROW BY ID THAT IS NOT MOLE OFFICE'S OWN. That row is in the registry and is not an agent,
 * and its id is drawn, so it may sort first; a rename of it is refused.
 */
export async function fillTheRenameProof(): Promise<string> {
  const said = 'An agent renamed by the person at once, and a proposal for it that the person refused.'
  if (sqlite.prepare('SELECT 1 FROM agent_renames LIMIT 1').get() !== undefined) return said
  const { setParticipantName } = await import('./participants.ts')
  const { proposeARename, refuseARename } = await import('./agent-renames.ts')
  const { MESSAGE_CENTRE } = await import('@shared/workspaces.ts')
  const person = sqlite.prepare('SELECT id FROM people LIMIT 1').get() as { id: string } | undefined
  const live = sqlite.prepare('SELECT id, name FROM agents WHERE retired = 0 ORDER BY id').all() as { id: string; name: string }[]
  const agent = live.find((row) => !isMoleOffice({ kind: 'agent', id: row.id }))
  if (person === undefined || agent === undefined) {
    throw new Error('The restore proof has the person rename a live agent, and its corpus holds no person or no live agent.')
  }
  const actor = { type: 'human' as const, id: person.id }
  setParticipantName({ kind: 'agent', id: agent.id }, 'Restore proof', { kind: 'person', id: person.id }, 'The restore proof carries a rename.')
  const proposed = proposeARename(agent.id, { name: 'Restore proof again', because: 'A proposal for the restore proof.' }, actor, MESSAGE_CENTRE)
  refuseARename(proposed.rename.id, 'The restore proof refuses it.', actor)
  return said
}
// The schema part of agent_renames names this file for its fill, so the database folder imports nothing above itself.
giveTheFill('src/server/lib/agent-names.ts', fillTheRenameProof)
