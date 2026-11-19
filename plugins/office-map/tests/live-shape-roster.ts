// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { PLUGIN_READ_INTERFACE } from '../../../src/shared/plugin-read.ts'
import type { RosterAgent, RosterView } from '../src/contracts.ts'

/**
 * A made-up roster in the shape of the live office whose map drew no seats. No row is a real
 * person or agent. Every name is made here from two short word lists, and no count names anybody.
 *
 * The counts were read from the live office's roster door and sent here as numbers only:
 * - 1,826 agents. 721 are retired, which leaves 1,105 on the map, and retired agents keep their seats.
 * - Seven secretaries, oldest first. The oldest started 591 agents directly. 61 of them are
 *   supervisors, whose teams hold 893 more agents.
 * - Supervisors are started only by secretaries, so no chain is longer than two links.
 * - 15 agents have no secretary among their starters. 11 have no starter and 4 were started by the person.
 * - Two visitors, both retired. Names in Chinese and English.
 */
export function liveShapeRoster(): RosterView {
  let seed = 1826
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const en = ['Ash', 'Birch', 'Cedar', 'Dale', 'Elm', 'Fern', 'Glen', 'Hazel', 'Iris', 'Juniper', 'Kestrel', 'Larch', 'Moss', 'Nettle', 'Oak', 'Pine']
  const zh = ['远帆', '青山', '白桦', '松风', '云杉', '小溪', '晨光', '石竹', '海棠', '紫藤', '银杏', '雪松']
  const agents: RosterAgent[] = []
  const add = (role: string | null, startedBy: RosterAgent['startedBy'], retired: boolean, visitor = false): RosterAgent => {
    const n = agents.length, chinese = n % 3 === 0
    const row: RosterAgent = { kind: 'agent', id: `made-${n}`, handle: chinese ? `zh-${n}` : `${en[n % en.length]!.toLowerCase()}-${n}`,
      name: chinese ? `${zh[n % zh.length]}${n}` : `${en[n % en.length]} ${n}`, role, retired, visitor, startedBy, createdAt: '' }
    agents.push(row); return row
  }
  /** `count` marks, exactly `retired` of them true, at places the seeded random picks. */
  const marks = (count: number, retired: number): boolean[] => {
    const result = Array.from({ length: count }, (_, i) => i < retired)
    for (let i = count - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j]!, result[i]!] }
    return result
  }
  const several = (count: number, retired: number, make: (retired: boolean) => RosterAgent): RosterAgent[] => marks(count, retired).map(make)
  const by = (a: RosterAgent): RosterAgent['startedBy'] => ({ kind: 'agent', id: a.id })
  const person = { kind: 'person', id: 'made-person' } as const
  const secretaries = [false, true, true, false, false, false, false].map(retired => add('secretary', person, retired))
  const [first, second, third, fourth, fifth, sixth, seventh] = secretaries as [RosterAgent, RosterAgent, RosterAgent, RosterAgent, RosterAgent, RosterAgent, RosterAgent]
  /** Supervisors started by one secretary, `retired` of them retired. The first `current` are never retired. */
  const supervised = (secretary: RosterAgent, count: number, retired: number, current = 0): RosterAgent[] =>
    [...Array.from({ length: current }, () => false), ...marks(count - current, retired)].map(flag => add('supervisor', by(secretary), flag))
  const teams: { lead: RosterAgent; size: number; retired: number }[] = []

  // Secretary 1: 518 workers (302 retired), 61 supervisors (44 retired), 12 others (all retired).
  several(518, 302, flag => add('worker', by(first), flag))
  // 37 of the supervisors lead the 893. The seven largest teams are the live office's, and their
  // leads are not retired. 30 small teams make up the rest.
  const small = Array.from({ length: 30 }, () => 2 + Math.floor(random() * 12))
  const short = 893 - 660 - small.reduce((sum, size) => sum + size, 0)
  for (let i = 0; i < Math.abs(short); i++) small[i % small.length]! += Math.sign(short)
  const sizes = [194, 126, 87, 74, 68, 66, 45, ...small], leads = supervised(first, 61, 44, 7)
  // A retired supervisor's team retired with it. The rest of the 244 retired members are spread over the other teams.
  const gone = sizes.reduce((sum, size, i) => sum + (leads[i]!.retired ? size : 0), 0)
  const flags = marks(sizes.reduce((sum, size, i) => sum + (leads[i]!.retired ? 0 : size), 0), 244 - gone)
  let at = 0
  sizes.forEach((size, i) => teams.push({ lead: leads[i]!, size, retired: leads[i]!.retired ? size : flags.slice(at, at += size).filter(Boolean).length }))
  for (let i = 0; i < 10; i++) add(null, by(first), true)
  add('inspector', by(first), true); add('mailer', by(first), true)

  // Secretary 2, retired: 11 workers and 1 supervisor with a team of 40, all retired.
  several(11, 11, flag => add('worker', by(second), flag))
  teams.push({ lead: add('supervisor', by(second), true), size: 40, retired: 40 })
  // Secretary 3, retired: 11 workers and 3 without a role, all retired.
  several(11, 11, flag => add('worker', by(third), flag))
  for (let i = 0; i < 3; i++) add(null, by(third), true)
  // Secretary 4: 2 workers, 9 supervisors (3 retired); two current ones lead 73 agents (27 retired).
  several(2, 0, flag => add('worker', by(fourth), flag))
  const fourthLeads = supervised(fourth, 9, 3, 2)
  teams.push({ lead: fourthLeads[0]!, size: 38, retired: 14 }, { lead: fourthLeads[1]!, size: 35, retired: 13 })
  // Secretary 5: 9 workers (5 retired), 3 supervisors (1 retired), 1 inspector.
  several(9, 5, flag => add('worker', by(fifth), flag))
  supervised(fifth, 3, 1)
  add('inspector', by(fifth), false)
  // Secretary 6: 20 workers and 5 supervisors, none retired.
  several(20, 0, flag => add('worker', by(sixth), flag))
  supervised(sixth, 5, 0)
  // Secretary 7: 21 workers and 2 supervisors; one leads a team of 109 (1 retired).
  several(21, 0, flag => add('worker', by(seventh), flag))
  teams.push({ lead: supervised(seventh, 2, 0)[0]!, size: 109, retired: 1 })
  for (const team of teams) several(team.size, team.retired, flag => add('worker', by(team.lead), flag))

  // No secretary among the starters. 11 with no starter: 3 supervisors, 3 workers (2 of them
  // visitors) and 5 without a role, all retired. 4 started by the person, without a role, 3 retired.
  for (let i = 0; i < 3; i++) add('supervisor', null, true)
  for (let i = 0; i < 3; i++) add('worker', null, true, i < 2)
  for (let i = 0; i < 5; i++) add(null, null, true)
  several(4, 3, flag => add(null, person, flag))

  // Secretaries are the oldest, in order; everyone else was made at a time the seeded random picks.
  const order = agents.slice(secretaries.length).map(row => ({ row, at: random() }))
  order.sort((a, b) => a.at - b.at)
  for (const [i, row] of [...secretaries, ...order.map(one => one.row)].entries()) {
    const minutes = i * 23, day = String(1 + Math.floor(minutes / 1440)).padStart(2, '0')
    row.createdAt = `2026-08-${day} ${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`
  }
  return {
    interface: PLUGIN_READ_INTERFACE, view: 'roster', narrowedByPermission: null,
    people: [{ kind: 'person', id: 'made-person', handle: 'made-person', name: 'Made-up person' }], agents,
  }
}

/**
 * The same made-up office grown to the size of the live office on 5 November 2026, read from it as
 * numbers only: 1,128 agents on the map in 41 rooms. The oldest agent on the map has no role and no
 * starter, as the office's own sender has, so the first view opens on the room of agents without a
 * stated role. One more supervisor of the sixth secretary leads a team of 21, which is the 41st room.
 */
export function liveSizeRoster(): RosterView {
  const roster = liveShapeRoster(), agents = roster.agents
  const secretary = agents.filter(agent => agent.role === 'secretary')[5]!
  const row = (n: number, role: string | null, startedBy: RosterAgent['startedBy'], createdAt: string): RosterAgent =>
    ({ kind: 'agent', id: `made-${n}`, handle: `${role ?? 'none'}-${n}`, name: `${role === null ? 'Sender' : 'Made-up'} ${n}`, role, retired: false, visitor: false, startedBy, createdAt })
  agents.unshift(row(agents.length, null, null, '2026-07-31 23:00:00'))
  const lead = row(agents.length, 'supervisor', { kind: 'agent', id: secretary.id }, '2026-09-01 00:00:00')
  agents.push(lead)
  for (let i = 0; i < 21; i++) agents.push(row(agents.length, 'worker', { kind: 'agent', id: lead.id }, `2026-09-01 ${String(1 + i).padStart(2, '0')}:00:00`))
  return roster
}

/** The five views a page reads, made up for the agents of `roster`, as the screen shell answers them. */
export function liveShapeViews(roster: RosterView) {
  const common = { interface: PLUGIN_READ_INTERFACE, narrowedByPermission: null }
  const projects = Array.from({ length: 4 }, (_, i) => ({ id: `synthetic-project-${i}`, name: `Made-up project ${i + 1}` }))
  const none = { candidates: 0, carried: 0, leftOut: 0, shortened: 0 }
  const details = ['executing', 'checking', 'waiting_message', 'idle', 'blocked', 'completed']
  return {
    projects: { ...common, view: 'projects', projects }, roster,
    people: { ...common, view: 'people', people: roster.people, agents: roster.agents.map((agent, i) => ({ ...agent, projects: [projects[i % 4]!.id],
      appearance: null, appearanceChosen: false, scale: null, presence: [{ project: projects[i % 4]!.id, colour: 'green', word: 'Available' }] })) },
    work: { ...common, view: 'work', work: roster.agents.filter(agent => !agent.retired).map((agent, i) => ({ id: `made-work-${i}`, project: projects[i % 4]!.id,
      agent: agent.id, title: `Made-up task ${i + 1}`, detail: details[i % details.length]!, recordedState: { synthetic: true }, doing: null,
      executing: i % details.length === 0, association: 'made-up work', updatedAt: '2026-08-31 12:00:00', runStanding: 'working' })) },
    talk: { ...common, view: 'talk', messages: [], last: null, more: false, subtraction: none, leftOutGroups: [], refusal: null,
      withdrawn: { ids: [], last: '0', more: false, subtraction: none, leftOutGroups: [] } },
  }
}
