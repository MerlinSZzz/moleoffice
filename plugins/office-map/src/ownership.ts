// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { RosterAgent } from './contracts.ts'
import type { FacilityPlace, Layout, Point } from './geometry.ts'
import { stableHash } from './village.ts'
import type { VillageGroup, VillageRoster } from './village-layout.ts'

export type RoomKind = 'secretariat' | 'direct' | 'supervisor' | 'inspector' | 'unassigned' | 'unknown'
export interface OwnershipGroup extends VillageGroup { kind: RoomKind; owner: string | null; leader: string | null; zh: string }
export interface Ownership { groups: OwnershipGroup[]; secretaries: { id: string; label: string; zh: string; createdAt: string }[] }
const key = (kind: string, id: string | null) => JSON.stringify([kind, id])
const ownershipName = (a: RosterAgent, zh = false): string => (a.name || a.handle) + (a.retired ? zh ? '（已退役；历史归属）' : ' (retired; historical ownership)' : '')

/** Recorded starter links locate rooms, never departments or authority. Retired
 * rows remain allocation history; their label never claims a current role. */
export function* ownershipRoster(ordered: RosterAgent[]): Generator<void, VillageRoster> {
  const agents = new Map<string, RosterAgent>(), groups = new Map<string, OwnershipGroup>()
  for (const a of ordered) { agents.set(a.id, a); yield }
  const people: VillageRoster['people'][number][] = [], secretaries: Ownership['secretaries'] = []
  for (const a of ordered) { if (a.role === 'secretary' && !a.visitor) secretaries.push({ id: a.id, label: ownershipName(a), zh: ownershipName(a, true), createdAt: a.createdAt }); yield }
  function* owner(a: RosterAgent): Generator<void, string | null> {
    const seen = new Set<string>()
    let at: RosterAgent | undefined = a, found: string | null = null
    while (at) {
      if (seen.has(at.id)) return null
      seen.add(at.id)
      if (at.role === 'secretary' && !at.visitor && found === null) found = at.id
      at = at.startedBy?.kind === 'agent' ? agents.get(at.startedBy.id) : undefined
      yield
    }
    return found
  }
  for (const a of ordered) {
    const starter = a.startedBy?.kind === 'agent' ? agents.get(a.startedBy.id) : undefined
    const lead = a.role === 'supervisor' ? a : a.role === 'worker' && starter?.role === 'supervisor' ? starter : null
    const secretary = yield* owner(lead ?? a)
    const kind: RoomKind = a.visitor ? 'unknown' : a.role === 'secretary' ? 'secretariat' : a.role === 'inspector' ? 'inspector' :
      lead ? 'supervisor' : a.role === 'worker' && starter?.role === 'secretary' && !starter.visitor && secretary !== null ? 'direct' : a.role !== 'worker' ? 'unassigned' : 'unknown'
    const leader = lead?.id ?? (kind === 'direct' ? starter!.id : null)
    const id = key(kind, kind === 'secretariat' || kind === 'inspector' || kind === 'unassigned' ? null : leader ?? a.startedBy?.id ?? null)
    if (!groups.has(id)) {
      const name = lead ? lead.name || lead.handle : starter?.name || starter?.handle
      const ownerName = secretary === null ? null : ownershipName(agents.get(secretary)!)
      const ownerZh = secretary === null ? null : ownershipName(agents.get(secretary)!, true)
      const suffix = lead?.retired || kind === 'direct' && starter?.retired ? ' (retired)' : ''
      const label = kind === 'secretariat' ? 'Secretariat' : kind === 'direct' ? `${name} · Secretary-direct${suffix}` : kind === 'supervisor' ?
        `${ownerName ?? 'Ownership unknown'} · Supervisor ${name}${suffix}` : kind === 'inspector' ? 'Independent inspector' : kind === 'unassigned' ? 'Role not stated' : 'Ownership unknown'
      const zh = kind === 'secretariat' ? '秘书处' : kind === 'direct' ? `${name} · 秘书直属${suffix ? '（已退役）' : ''}` : kind === 'supervisor' ?
        `${ownerZh ?? '归属未知'} · 主管 ${name}${suffix ? '（已退役）' : ''}` : kind === 'inspector' ? '独立检查员' : kind === 'unassigned' ? '未提供角色' : '归属未知'
      groups.set(id, { id, label, zh, createdAt: (lead ?? (kind === 'direct' ? starter : null) ?? a).createdAt, kind, owner: kind === 'direct' || kind === 'supervisor' ? secretary : null, leader })
    }
    const group = groups.get(id)!
    if (a.createdAt < group.createdAt) group.createdAt = a.createdAt
    people.push({ id: key('agent', a.id), group: id, createdAt: a.createdAt, retired: a.retired }); yield
  }
  return { groups: [...groups.values()], people, ownership: { groups: [...groups.values()], secretaries } }
}

/** shownOnMap decides which agents get a desk in the layout: every agent that is not
 * retired. Where each one is drawn is whereabouts's answer. */
export const shownOnMap = (agent: Pick<RosterAgent, 'retired'>): boolean => !agent.retired

export type Whereabouts = { where: 'desk' } | { where: 'play'; index: number } | { where: 'sleep'; index: number } | { where: 'hidden' }

const byId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

/** Where every agent is drawn, from who is online and who is asleep alone. A retired
 * agent is always hidden. Sleepers take the sleeping house in id order; offline agents
 * take the few play places in stable-hash order, and every other offline agent is
 * hidden. With no online reading every other agent stays at its desk. */
export function whereabouts(
  agents: { id: string; retired: boolean }[],
  online: Map<string, boolean> | null,
  asleep: ReadonlySet<string>,
  places: { play: number; sleep: number },
): Map<string, Whereabouts> {
  const found = new Map<string, Whereabouts>()
  const sleepers = agents.filter(agent => !agent.retired && asleep.has(agent.id)).sort((a, b) => byId(a.id, b.id))
  for (const [index, agent] of sleepers.entries()) found.set(agent.id, { where: 'sleep', index })
  const rest = agents.filter(agent => !agent.retired && !found.has(agent.id))
  if (online === null) {
    for (const agent of rest) found.set(agent.id, { where: 'desk' })
  } else {
    const offline: { id: string; retired: boolean }[] = []
    for (const agent of rest) {
      if (online.get(agent.id) === false) offline.push(agent)
      else found.set(agent.id, { where: 'desk' })
    }
    offline.sort((a, b) => stableHash(a.id) - stableHash(b.id) || byId(a.id, b.id))
    const playPlaces = Math.max(0, Math.min(3, Math.floor(places.play)))
    for (const [index, agent] of offline.entries()) found.set(agent.id, index < playPlaces ? { where: 'play', index } : { where: 'hidden' })
  }
  for (const agent of agents) if (!found.has(agent.id)) found.set(agent.id, { where: 'hidden' })
  return found
}

/** The point a whereabouts is drawn at. Hidden agents have none, and play or sleep
 * places that the layout does not supply are not invented. */
export function whereaboutsPoint(layout: Layout, key: string, at: Whereabouts): Point | null {
  if (at.where === 'desk') return layout.seats[key]?.foot ?? null
  if (at.where === 'hidden' || !layout.places) return null
  return (at.where === 'play' ? layout.places.play[at.index] : layout.places.sleep[at.index]) ?? null
}

/** The facility place each idle agent stands at, in its own room. `idle` holds the agents that are at their desks'
 * whereabouts and have no work open. A room's idle agents are taken in their desks' order; each starts at the place
 * its stable hash names and takes the next free one. An idle agent left without a place, and every agent at work,
 * stays at its desk. The answer is read from the layout and `idle` alone, so it changes only when who is idle does. */
export function facilityPlaces(layout: Layout, idle: ReadonlySet<string>): Map<string, FacilityPlace> {
  const found = new Map<string, FacilityPlace>(), rooms = new Map<string, FacilityPlace[]>()
  for (const place of layout.facilities ?? []) { const list = rooms.get(place.room) ?? []; list.push(place); rooms.set(place.room, list) }
  const keys = [...idle].filter(key => rooms.has(layout.seats[key]?.room ?? '')).sort((a, b) => layout.seats[a]!.index - layout.seats[b]!.index || byId(a, b))
  const taken = new Set<FacilityPlace>()
  for (const key of keys) {
    const places = rooms.get(layout.seats[key]!.room)!, start = stableHash(key) % places.length
    const place = Array.from(places.keys(), i => places[(start + i) % places.length]!).find(one => !taken.has(one))
    if (place) { taken.add(place); found.set(key, place) }
  }
  return found
}
