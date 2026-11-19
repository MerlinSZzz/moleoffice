// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { gatePosition } from '../../config/settings.mjs'
import { sqlite } from '../db/client.ts'
import { gateMet } from './gate-counts.ts'
import { aRaiseCarriesIt } from './records/own-words.ts'
import { getRecord } from './records/reading.ts'
import type { Actor } from './records/actor.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { type RegisteredAgent } from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theFiledAliasesReadOnce } from './registry-aliases/runs.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from './who-may-act.ts'

export type RestartWay = { mode: 'checkout' | 'installed'; prepare: (why: string) => Promise<() => void> }
let way: RestartWay | null = null
export function thisOfficeRestartsWith(next: RestartWay | null): void { way = next }
export function theRestartWay(): RestartWay | null { return way }

/** The test of a grant row's agent against these ids, asked as it was before when there is one. */
const isTheAgentOf = (ids: readonly string[]): string => (ids.length === 1 ? 'agent_id=?' : `agent_id IN (${ids.map(() => '?').join(',')})`)
/**
 * THE RESTART GRANT AN AGENT HOLDS, under its canonical id or an old registry id filed for it, with every id a row of it
 * may be stored under. A grant given before an alias was filed keeps the old id it was given under. Where the rows name
 * different decisions, nothing says which one holds, so the agent holds none.
 */
export function theRestartGrantOf(agentId: string): { ids: string[]; decision: string | null } {
  const ids = theFiledAliasesReadOnce(sqlite).everyIdOf(agentId)
  const decisions = new Set((sqlite.prepare(`SELECT decision_id FROM office_restart_grants WHERE ${isTheAgentOf(ids)}`).all(...ids) as { decision_id: string }[]).map((one) => one.decision_id))
  return { ids, decision: decisions.size === 1 ? [...decisions][0]! : null }
}
/** Give an agent's grant under its canonical id, the first of `ids`, or remove it, and clear the rows under its old ids. */
export function writeTheRestartGrant(ids: readonly string[], decision: string | null): void {
  const [canonical, ...old] = ids
  if (decision === null) { sqlite.prepare(`DELETE FROM office_restart_grants WHERE ${isTheAgentOf(ids)}`).run(...ids); return }
  if (old.length > 0) sqlite.prepare(`DELETE FROM office_restart_grants WHERE ${isTheAgentOf(old)}`).run(...old)
  sqlite.prepare('INSERT INTO office_restart_grants (agent_id,decision_id) VALUES (?,?) ON CONFLICT(agent_id) DO UPDATE SET decision_id=excluded.decision_id').run(canonical, decision)
}
/**
 * WHO MAY RESTART, PAUSE OR RESUME THIS OFFICE: the person, the owner's authority in a test world, or an agent using its
 * own key that holds a live restart grant. A pause or a resume is also carried by the person's grant, where this office's
 * list of what the grant carries lets it (`aRaiseCarriesIt`). It is asked after every other way in, so the grant is named
 * only when nothing else allowed the press.
 *
 * THE GRANT DOES NOT CARRY A RESTART. A restart starts a new server on the same database file, and that server migrates
 * the file in place when no row in it is irreplaceable or every record came from the seed (`prepareToServe` in
 * src/server/db/migrate.ts). So office.restart stays on THE_DOORS_THAT_DO_NOT_ASK_YET until a restart is shown not to
 * migrate the database in use.
 *
 * A PAUSE OR A RESUME IS UNDER THE GATE who-pauses-the-office, AND A RESTART IS NOT. At off any agent its own key proves
 * may also pause or resume the office's work, and the gate counts it. The raise is then not asked, as at the other doors
 * that read their gate before the raise. A restart stays as it is at both positions, because it can migrate the database
 * in use, and that cannot be undone.
 */
export function assertMayRestartOrPause(actor: Actor, what: 'a restart' | 'a pause or resume' = 'a restart'): void {
  if (thePersonIsProved(actor) || actor.theOwnersAuthority?.holds === true) return
  if (actor.type === 'agent' && actor.provedBy === 'an-agent-key') {
    const who = participantForActor(actor)
    const row = (who?.kind === 'agent' ? readParticipant(who) : null) as RegisteredAgent | null
    const grant = who?.kind === 'agent' ? theRestartGrantOf(who.id).decision : null
    const decision = grant === null ? null : getRecord(grant)
    if (row !== null && row.retired !== true && decision?.kind === 'decision' && decision.deletedAt === null) return
  }
  if (what === 'a pause or resume') {
    const position = gatePosition('who-pauses-the-office')
    if (position === 'block' && aRaiseCarriesIt(actor)) return
    const keyed = anAgentItsOwnKeyProves(actor) !== null
    if (keyed && gateMet('who-pauses-the-office', position!) !== 'block') return
    if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-pauses-the-office', 'pause or resume the office\'s work')
  }
  throw new PanelError('Only the owner or an agent with a live restart grant, using its own key, may restart or pause this office. A role card or raise alone is not enough.', 403, undefined, undefined, undefined, { code: 'officeRestartNotAllowed', values: { reason: 'Only the owner or an agent with a live grant and its own key may restart or pause this office.' } })
}
