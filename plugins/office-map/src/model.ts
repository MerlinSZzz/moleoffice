// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { PIXEL_DETAILS, type PixelDetail, type PixelState, type PluginPeopleView, type PluginProjectsView } from '../../../src/shared/plugin-read.ts'
import { portraitOf, standingOf, type Portrait, type Standing } from './appearance.ts'
import type { RosterAgent, RosterView, Facts, AgentFacts } from './contracts.ts'
import type { ReadWork } from './read.ts'
import { words } from './words.ts'
import type { VillageRoster } from './village-layout.ts'
import { ownershipRoster, shownOnMap } from './ownership.ts'

type Agent = PluginPeopleView['agents'][number]
export type WorkRow = ReadWork['work'][number]
export type Zone = 'visitor' | 'team' | 'leadership' | 'secretary' | 'inspector' | 'unassigned' | 'people'
export interface Occupant {
  key: string
  facts?: AgentFacts
  agent: Agent
  zone: Zone
  team: string | null
  starter: { kind: 'person' | 'agent'; id: string; name: string } | null
  relationshipUnavailable: boolean
  portrait: Portrait
  standing: Standing
  work: WorkRow[]
  projects: { id: string; name: string | null }[]
}
export interface Room { id: string; zone: Zone; leader: string | null; occupants: string[]; label?: string; zh?: string }
export function roomWords(room: Room, language: 'en' | 'zh'): string {
  return (language === 'zh' ? room.zh : room.label) ?? `${words[language][room.zone]}${room.leader === null ? '' : ' · ' + room.leader}`
}
export interface Seat { room: string; index: number }
export interface OfficeModel {
  rosterOrder: string[]
  layoutRoster: VillageRoster
  occupants: Occupant[]
  people: PluginPeopleView['people']
  rooms: Room[]
  seats: Record<string, Seat>
  unmatchedWork: number
  unmatchedWorkRows: WorkRow[]
}
export const identity = (kind: 'person' | 'agent', id: string): string => JSON.stringify([kind, id])

/** Decorative rooms use recorded starters, never an inferred reporting chain or authority. */
export function mapOffice(people: PluginPeopleView | RosterView, work: ReadWork | null, projects: PluginProjectsView | null = null, facts?: Facts): OfficeModel {
  const build = mapOfficeSteps(people, work, projects, facts)
  for (;;) { const next = build.next(); if (next.done) return next.value }
}

/** Every roster/work row and starter link is a cancellation and scheduling boundary. */
export function* mapOfficeSteps(people: PluginPeopleView | RosterView, work: ReadWork | null, projects: PluginProjectsView | null = null, facts?: Facts): Generator<void, OfficeModel> {
  const agents = new Map<string, RosterAgent>(), persons = new Map<string, PluginPeopleView['people'][number]>(), projectNames = new Map<string, string>()
  for (const agent of people.agents) { agents.set(agent.id, agent); yield }
  for (const person of people.people) { persons.set(person.id, person); yield }
  for (const project of projects?.projects ?? []) { projectNames.set(project.id, project.name); yield }
  const workByAgent = new Map<string, WorkRow[]>()
  for (const row of work?.work ?? []) {
    const entries = workByAgent.get(row.agent) ?? []
    entries.push(row); workByAgent.set(row.agent, entries); yield
  }
  function* inCycle(agent: RosterAgent): Generator<void, boolean> {
    const seen = new Set<string>([agent.id])
    let starter = agent.startedBy
    while (starter?.kind === 'agent') {
      if (seen.has(starter.id)) return true
      seen.add(starter.id); starter = agents.get(starter.id)?.startedBy ?? null; yield
    }
    return false
  }
  const higher = new Set<string>(), retained: RosterAgent[] = []
  for (const agent of people.agents) {
    retained.push(agent)
    if (agent.role === 'supervisor' && agent.startedBy?.kind === 'agent' && !(yield* inCycle(agent))) higher.add(agent.startedBy.id)
    yield
  }
  const ordered = yield* orderAgents(retained), occupants: Occupant[] = [], rosterOrder: string[] = []
  const layoutRoster = yield* ownershipRoster(ordered)
  for (const rosterAgent of ordered) {
    const state = facts?.[rosterAgent.id]
    const heavy = people.view === 'people' ? agents.get(rosterAgent.id) as Agent : state?.people.status === 'loaded' ? state.people.value : null
    // Identity/group inputs always belong to the roster, even if a heavy read is older.
    const agent: Agent = { projects: [], appearance: null, appearanceChosen: false, scale: null, presence: [], ...heavy, ...rosterAgent }

    const ref = agent.startedBy
    const named = ref === null ? undefined : ref.kind === 'agent' ? agents.get(ref.id) : persons.get(ref.id)
    const invalid = ref !== null && (named === undefined || (yield* inCycle(agent)))
    const bad = invalid || !!(named && 'retired' in named && named.retired)
    const zone: Zone = agent.visitor ? 'visitor' : agent.role === 'secretary' ? 'secretary' :
      agent.role === 'inspector' ? 'inspector' : agent.role === 'supervisor' && higher.has(agent.id) ? 'leadership' :
      agent.role === 'worker' || agent.role === 'supervisor' ? 'team' : 'unassigned'
    const team = zone !== 'team' ? null : agent.role === 'supervisor' ? agent.id :
      ref?.kind === 'agent' && !invalid && agents.get(ref.id)?.role === 'supervisor' ? ref.id : null
    if (!shownOnMap(agent)) { yield; continue }
    rosterOrder.push(agent.id)
    const portrait = portraitOf(agent.appearance), ownProjects: Occupant['projects'] = []
    for (const id of agent.projects) { ownProjects.push({ id, name: projectNames.get(id) ?? null }); yield }
    occupants.push({ ...(people.view === 'roster' ? { facts: state ?? { people: { status: 'unloaded', error: null }, work: { status: 'unloaded', error: null } } } : {}), key: identity('agent', agent.id), agent, zone, team,
      starter: !bad && ref !== null && named !== undefined ? { ...ref, name: named.name } : null,
      relationshipUnavailable: bad, portrait, standing: standingOf(portrait, identity('agent', agent.id), agent.createdAt),
      work: people.view === 'roster' ? state?.work.status === 'loaded' ? state.work.value : [] : workByAgent.get(agent.id) ?? [], projects: ownProjects })
    yield
  }
  const groups = new Map<string, Room>(), known = new Set<string>()
  const assignments = new Map(layoutRoster.people.map(p => [p.id, p.group])), labels = new Map(layoutRoster.ownership!.groups.map(g => [g.id, g]))
  for (const occupant of occupants) {
    const id = assignments.get(occupant.key)!, label = labels.get(id)!
    if (!groups.has(id)) groups.set(id, { id, zone: occupant.zone, leader: occupant.team === null ? null : agents.get(occupant.team)?.name ?? null, label: label.label, zh: label.zh, occupants: [] })
    groups.get(id)!.occupants.push(occupant.key); known.add(occupant.agent.id); yield
  }
  const rooms = [...groups.values()], seats: Record<string, Seat> = Object.create(null) as Record<string, Seat>
  for (const room of rooms) for (let index = 0; index < room.occupants.length; index++) { seats[room.occupants[index]!] = { room: room.id, index }; yield }
  const unmatchedWorkRows: WorkRow[] = []
  for (const row of work?.work ?? []) { if (!known.has(row.agent)) unmatchedWorkRows.push(row); yield }
  return { rosterOrder, occupants, people: people.people, rooms, seats, unmatchedWork: unmatchedWorkRows.length, unmatchedWorkRows, layoutRoster }
}

const stableCompare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
/** Stable merge order, with a boundary at most every 128 element moves. */
function* orderAgents(input: RosterAgent[]): Generator<void, RosterAgent[]> {
  let source = input, target = new Array<RosterAgent>(input.length), moved = 0
  for (let width = 1; width < input.length; width *= 2) {
    for (let start = 0; start < input.length; start += width * 2) {
      const middle = Math.min(start + width, input.length), end = Math.min(start + width * 2, input.length)
      let left = start, right = middle
      for (let at = start; at < end; at++) {
        const a = source[left], b = source[right]
        target[at] = right >= end || left < middle && (stableCompare(a!.createdAt, b!.createdAt) || stableCompare(a!.id, b!.id)) <= 0 ? source[left++]! : source[right++]!
        if (++moved === 128) { moved = 0; yield }
      }
    }
    const previous = source; source = target; target = previous
  }
  return source
}

/** JSON equality without full-payload strings, yielding after at most 128 value/edge visits. */
function* equalReading(a: unknown, b: unknown): Generator<void, boolean> {
  const left = [a], right = [b]
  let visited = 0
  while (left.length) {
    const a = left.pop(), b = right.pop()
    if (++visited === 128) { visited = 0; yield }
    if (a === b) continue
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false
      for (let at = a.length - 1; at >= 0; at--) { left.push(a[at]); right.push(b[at]); if (++visited === 128) { visited = 0; yield } }
    } else {
      if (Array.isArray(b)) return false
      const one = a as Record<string, unknown>, other = b as Record<string, unknown>, keys = Object.keys(one)
      if (keys.length !== Object.keys(other).length) return false
      for (const key of keys) {
        if (!Object.hasOwn(other, key)) return false
        left.push(one[key]); right.push(other[key]); if (++visited === 128) { visited = 0; yield }
      }
    }
  }
  return true
}

/** A single last reading; a cancelled build never publishes a partial model or cache input. */
export class OfficeModelCache {
  private inputs: [PluginPeopleView | RosterView, ReadWork | null, PluginProjectsView | null, Facts | undefined] | null = null
  private model: OfficeModel | null = null
  computations = 0
  read(people: PluginPeopleView | RosterView | null, work: ReadWork | null, projects: PluginProjectsView | null, facts?: Facts): OfficeModel | null {
    const build = this.build(people, work, projects, facts)
    for (;;) { const next = build.next(); if (next.done) return next.value }
  }
  *build(people: PluginPeopleView | RosterView | null, work: ReadWork | null, projects: PluginProjectsView | null, facts?: Facts): Generator<void, OfficeModel | null> {
    if (people === null) { this.clear(); return null }
    const inputs: [PluginPeopleView | RosterView, ReadWork | null, PluginProjectsView | null, Facts | undefined] = [people, work, projects, facts]
    if (this.inputs && (yield* equalReading(inputs, this.inputs))) { this.inputs = inputs; return this.model }
    const model = yield* mapOfficeSteps(people, work, projects, facts)
    this.inputs = inputs; this.model = model; this.computations++
    return model
  }
  clear(): void { this.inputs = null; this.model = null }
}

/** A coherent loaded pair from one requested revision, even while a refresh for it is in flight. */
function coherentPair(occupant: Occupant): boolean {
  const { people, work } = occupant.facts!
  return people.status === 'loaded' && work.status === 'loaded' && !people.error && !work.error && people.revision === work.revision
}
/** Current heavy facts are a coherent pair from one requested revision. */
export function currentFacts(occupant: Occupant): boolean {
  if (!occupant.facts) return true
  return coherentPair(occupant) && ((occupant.facts as AgentFacts & { refreshGrace?: boolean }).refreshGrace === true || !occupant.facts.people.pending && !occupant.facts.work.pending)
}
/** A coherent loaded pair, even while a refresh for it is in flight. The loaded
 * values are the last answer from one revision, so work read from them is still
 * the work the agent had when the refresh began. */
export function coherentFacts(occupant: Occupant): boolean {
  return !occupant.facts || coherentPair(occupant)
}
/** How many occupants show a loaded work row in one state group for the partial work counters. A
 * pending refresh keeps the loaded value, so it still counts; a pair that is not loaded and coherent
 * does not. Null means nobody on the page has a readable work pair yet, so the counter is unread
 * rather than zero. */
export function partialWorkCount(occupants: readonly Occupant[], project: string | null, group: string): number | null {
  const readable = occupants.filter(one => !one.facts || coherentPair(one))
  if (!readable.length) return null
  return readable.filter(one => one.work.some(row => (project === null || row.project === project) && workGroup(row) === group)).length
}
/** Unknown is explicit; partial or failed facts never establish a project nonmatch. */
export function projectMatch(occupant: Occupant, project: string | null): 'match' | 'other' | 'unknown' | 'absent' {
  if (occupant.facts) {
    const { people, work } = occupant.facts
    if (people.status === 'absent' || work.status === 'absent') return 'absent'
    if (project !== null && !currentFacts(occupant)) return 'unknown'
  }
  if (project === null) return 'match'
  return inProject(occupant, project) ? 'match' : 'other'
}
export function searchContacts<T extends { name: string; handle: string }>(people: T[], search: string): T[] {
  const query = search.toLocaleLowerCase()
  return people.filter(one => `${one.name} ${one.handle}`.toLocaleLowerCase().includes(query))
}
export function searchRoster(occupants: Occupant[], search: string): Occupant[] {
  const query = search.toLocaleLowerCase()
  return occupants.filter(one => `${one.agent.name} ${one.agent.handle}`.toLocaleLowerCase().includes(query))
}

/** The project filter changes visibility only; it never takes part in room or seat assignment. */
export function inProject(occupant: Occupant, project: string | null): boolean {
  return project === null || occupant.agent.projects.includes(project) || occupant.work.some(row => row.project === project)
}

export function workGroup(row: WorkRow): PixelState {
  return Object.hasOwn(PIXEL_DETAILS, row.detail) ? PIXEL_DETAILS[row.detail as PixelDetail].group : 'unknown'
}

export function workWords(row: WorkRow, language: 'en' | 'zh'): string {
  if (row.detail === 'completed') {
    if (row.runStanding === 'closed unchecked') return language === 'zh' ? '已关闭，未检查' : 'Closed without a check'
    if (row.runStanding !== 'closed') return language === 'zh' ? '已关闭；检查结果未提供' : 'Closed; check outcome not supplied'
  }
  return Object.hasOwn(PIXEL_DETAILS, row.detail) ? PIXEL_DETAILS[row.detail as PixelDetail][language] :
    language === 'zh' ? '未提供此工作状态的说明' : 'Work state not described'
}

/** Cosmetic metadata only; expiry includes time waiting for a route or an approach slot. */
export const CONTACT_LIMITS = { active: 4, queued: 16, cacheAgeMs: 15_000, targetsPerMessage: 1 } as const

/** A cancellable generation gate also rejects late jobs when a worker path becomes available. */
export class LayoutGeneration {
  private generation = 0
  private closed = false
  next(): number { return ++this.generation }
  accepts(generation: number): boolean { return !this.closed && generation === this.generation }
  cancel(): void { this.generation += 1 }
  dispose(): void { this.closed = true; this.cancel() }
}
