// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Generated inputs only. No file, network, clock or office data is read here. */
import { createHash } from 'node:crypto'

export const OCCUPANT_COUNTS = [100, 500, 1000, 5000]
export const WORK_DETAILS = ['executing', 'checking', 'recorded_work', 'waiting_check', 'rebuttal', 'reporting', 'queued', 'idle', 'waiting_message', 'paused', 'blocked', 'failed', 'completed', 'task_completed', 'work_open', 'unknown']
const common = { interface: 'office-read/1', narrowedByPermission: null }
const counts = n => ({ candidates: n, carried: n, leftOut: 0, shortened: 0 })
const agentId = (seed, i) => `synthetic-${seed}-${String(i).padStart(5, '0')}`

/** Every corpus has all sixteen work details, simultaneous rows, people and bounded talk metadata. */
export function syntheticFixture(occupants, seed = 7) {
  if (!OCCUPANT_COUNTS.includes(occupants) || !Number.isSafeInteger(seed) || seed < 0) throw new Error('Use 100, 500, 1000 or 5000 occupants and a nonnegative integer seed')
  const projects = { ...common, view: 'projects', projects: Array.from({ length: 4 }, (_, i) => ({ id: `synthetic-project-${i}`, name: `Synthetic project ${i + 1}` })) }
  const people = { ...common, view: 'people', people: Array.from({ length: Math.ceil(occupants / 20) }, (_, i) => ({ kind: 'person', id: `synthetic-person-${i}`, name: `Synthetic person ${i + 1}`, handle: `synthetic-person-${i}` })), agents: [] }
  for (let i = 0; i < occupants; i++) {
    const role = i % 12 === 0 ? 'supervisor' : i % 47 === 0 ? 'inspector' : i % 53 === 0 ? 'secretary' : 'worker'
    people.agents.push({ kind: 'agent', id: agentId(seed, i), handle: `synthetic-${i}`, name: `Synthetic agent ${i + 1}`, role, retired: false, visitor: i % 59 === 58,
      startedBy: role === 'worker' ? { kind: 'agent', id: agentId(seed, Math.floor(i / 12) * 12) } : null,
      createdAt: `2026-01-01 ${String(Math.floor(i / 3600)).padStart(2, '0')}:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
      projects: [projects.projects[i % 4].id], appearance: null, appearanceChosen: false, scale: { version: 1, roleAtGeneration: role, value: .85 },
      presence: [{ project: projects.projects[i % 4].id, colour: i % 3 ? 'green' : 'grey', word: i % 3 ? 'Available' : 'Not established' }] })
  }
  const work = { ...common, view: 'work', work: people.agents.flatMap((agent, i) => Array.from({ length: i % 5 === 0 ? 3 : 1 }, (_, j) => ({
    id: `synthetic-work-${i}-${j}`, project: projects.projects[(i + j) % 4].id, agent: agent.id, title: `Synthetic work ${i + 1}.${j + 1}`,
    detail: WORK_DETAILS[(i + j) % 16], recordedState: { synthetic: true, state: WORK_DETAILS[(i + j) % 16] }, doing: 'Synthetic activity',
    executing: (i + j) % 16 < 2, association: 'synthetic explicit work', updatedAt: '2026-01-01 12:00:00',
    runStanding: (i + j) % 16 === 12 ? ['closed', 'closed unchecked', null][Math.floor((i + j) / 16) % 3] : 'working',
  }))) }
  // Published talk cap: 1,000 messages and 1,000 withdrawals. No invented bound on recipients.
  const messages = Array.from({ length: 1000 }, (_, i) => ({ id: `synthetic-talk-${i}`, project: projects.projects[i % 4].id, at: '2026-01-01 12:00:00',
    from: { kind: 'agent', id: agentId(seed, (i * 2) % occupants) },
    to: [1, 2, 3, 4].map(offset => ({ kind: 'agent', id: agentId(seed, (i * 2 + offset) % occupants) })) }))
  const talk = { ...common, view: 'talk', messages, last: '2026-01-01 12:00:00~synthetic-talk-999', more: true, subtraction: { ...counts(1000), candidates: 1001, leftOut: 1 },
    leftOutGroups: [{ cause: 'budget', bucket: 'message_limit', count: 1, ids: ['synthetic-talk-next'] }], refusal: null,
    withdrawn: { ids: Array.from({ length: 1000 }, (_, i) => `synthetic-withdrawn-${i}`), last: '1000', more: false, subtraction: counts(1000), leftOutGroups: [] } }
  const views = { projects, people, work, talk }
  const sha256 = createHash('sha256').update(JSON.stringify(views)).digest('hex')
  return { schema: 1, synthetic: true, seed, occupants, counts: { occupants, people: people.people.length, projects: 4, work: work.work.length, messages: 1000, withdrawals: 1000, recipientsPerMessage: 4 }, sha256, views }
}

/** Fresh bounded burst after a populated baseline; first-open data is never replayed. */
export function talkBurst(fixture, sequence, pairs = null) {
  const messages = fixture.views.talk.messages.slice(0, 20).map((m, i) => ({ ...m, id: `synthetic-burst-${sequence}-${i}`,
    ...(pairs?.length ? { from: { kind: 'agent', id: JSON.parse(pairs[i % pairs.length][0])[1] }, to: [{ kind: 'agent', id: JSON.parse(pairs[i % pairs.length][1])[1] }] } : {}) }))
  return { ...fixture.views.talk, messages, last: `2026-01-01 12:00:00~synthetic-burst-${sequence}-19`, more: false, subtraction: counts(20), leftOutGroups: [],
    withdrawn: { ids: [], last: '1000', more: false, subtraction: counts(0), leftOutGroups: [] } }
}
