// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Central round-50 shape adapter. Generated simulation only; never host evidence. */
import { syntheticFixture } from './synthetic-fixtures.mjs'
export function rosterFrom(people) {
  return { interface: people.interface, view: 'roster', narrowedByPermission: people.narrowedByPermission, people: people.people,
    agents: people.agents.map(({ kind, id, handle, name, role, retired, visitor, startedBy, createdAt }) => ({ kind, id, handle, name, role, retired, visitor, startedBy, createdAt })) }
}
export function screenFixture(size) {
  const source = syntheticFixture(size, 7)
  return { ...source, views: { ...source.views, roster: rosterFrom(source.views.people) } }
}
export function namedAnswer(fixture, view, query) {
  if (!['people', 'work'].includes(view)) return fixture.views[view] ?? null
  if (!query || !Object.hasOwn(query, 'agents')) throw Error('Heavy read must name agents explicitly')
  if (typeof query.agents !== 'string' || query.agents.length > 32500 || Object.keys(query).some(key => key !== 'agents')) throw Error('Invalid named query')
  const ids = [...new Set(query.agents === '' ? [] : query.agents.split(','))]
  if (ids.length > 500 || ids.some(id => !/^[A-Za-z0-9_-]{1,64}$/.test(id))) throw Error('Invalid agent IDs')
  const selected = new Set(ids), known = new Set(fixture.views.roster.agents.map(agent => agent.id))
  const notAgents = ids.filter(id => !known.has(id))
  return view === 'people' ? { ...fixture.views.people, agents: fixture.views.people.agents.filter(agent => selected.has(agent.id)), notAgents } :
    { ...fixture.views.work, work: fixture.views.work.work.filter(row => selected.has(row.agent)), notAgents }
}
