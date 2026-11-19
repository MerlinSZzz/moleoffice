// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { PIXEL_DETAILS, PIXEL_STATES } from '../../../src/shared/plugin-read.ts'
import { portraitOf } from '../src/appearance.ts'
import { CONTACT_LIMITS, identity, inProject, LayoutGeneration, mapOffice, partialWorkCount, workGroup, workWords } from '../src/model.ts'
import { readView } from '../src/read.ts'
import { agent, apron, legacy, people, projects, talk, work, workRow } from './fixtures.ts'

describe('published view mapping', () => {
  it('keeps every simultaneous run and claim, with all original facts', () => {
    const model = mapOffice(people, work)
    const occupant = model.occupants.find(one => one.agent.id === 'same')!
    expect(occupant.work).toEqual(work.work)
    expect(occupant.work).toHaveLength(4)
    expect(occupant.work[0]?.executing).toBe(false)
    expect(occupant.work[0]?.doing).toBeTruthy()
    expect(occupant.work[0]?.recordedState).toEqual({ state: 'custom' })
    expect(model.people[0]?.id).toBe('same')
    expect(identity('person', 'same')).not.toBe(occupant.key)
  })
  it('uses every published detail in every published group', () => {
    expect(Object.keys(PIXEL_DETAILS)).toHaveLength(16)
    expect(new Set(Object.keys(PIXEL_DETAILS).map(detail => workGroup(workRow(detail, { detail }))))).toEqual(new Set(Object.keys(PIXEL_STATES)))
    for (const [detail, value] of Object.entries(PIXEL_DETAILS)) {
      expect(workGroup(workRow(detail, { detail }))).toBe(value.group)
      if (detail !== 'completed') for (const language of ['en', 'zh'] as const) expect(workWords(workRow(detail, { detail }), language)).toBe(value[language])
    }
  })
  it('never describes an unchecked or unknown closure as confirmed complete', () => {
    expect(workWords(workRow('a', { detail: 'completed', runStanding: 'closed unchecked' }), 'en')).toBe('Closed without a check')
    expect(workWords(workRow('a', { detail: 'completed', runStanding: 'closed unchecked' }), 'zh')).toBe('已关闭，未检查')
    for (const runStanding of [null, 'superseded', 'future']) expect(workWords(workRow('a', { detail: 'completed', runStanding }), 'en')).not.toContain('Confirmed')
    expect(workWords(workRow('a', { detail: 'completed', runStanding: 'closed' }), 'en')).toBe('Confirmed complete')
    expect(workWords(workRow('a', { detail: 'task_completed', runStanding: null }), 'en')).toBe('Task recorded complete')
  })
  it('retains unfamiliar workflow words and original state without classifying them', () => {
    const data = readView('work', { ...work, work: [workRow('future', { detail: 'future', runStanding: 'future', recordedState: { state: 'new', paused: 'unknown' } })] })!
    expect(data.work[0]?.recordedState).toEqual({ state: 'new', paused: 'unknown' })
    expect(data.work[0]?.detail).toBe('future')
    expect(workGroup(data.work[0]!)).toBe('unknown')
  })
  it('keeps presence separate, including multiple projects, and invents no human presence', () => {
    const source = structuredClone(people)
    source.agents[0]!.presence.push({ project: 'library', colour: 'amber', word: 'Waiting' })
    const mapped = mapOffice(source, null)
    const occupant = mapped.occupants.find(one => one.agent.id === 'same')!
    expect(occupant.agent.presence).toEqual(source.agents[0]?.presence)
    expect(occupant.work).toEqual([])
    expect(mapped.people[0]).not.toHaveProperty('presence')
  })
  it('projects and validates all view fields and discards talk words and unknown additions', () => {
    expect(readView('projects', projects)).toEqual(projects)
    expect(readView('people', people)).toEqual(people)
    expect(readView('work', work)).toEqual(work)
    const message = { id: 'm', at: '2026-01-01 10:00:00', project: 'garden', from: { kind: 'person' as const, id: 'same' }, to: [{ kind: 'agent' as const, id: 'same' }], body: 'not a published field' }
    expect(readView('talk', talk({ messages: [message], last: '2026-01-01 10:00:00~m' }))?.messages[0]).not.toHaveProperty('body')
    expect(readView('people', { ...people, agents: [{ ...people.agents[0], scale: { value: -1 } }] })).toBeNull()
    expect(readView('people', work)).toBeNull()
    expect(readView('talk', talk({ last: 'broken' }))).toBeNull()
    expect(readView('talk', talk({ withdrawn: { ...talk().withdrawn, last: 'broken' } }))).toBeNull()
  })
})

describe('roster rooms and immutable cosmetics', () => {
  it('handles missing, dangling, cyclic, retired and unfamiliar-role starters', () => {
    const source = { ...people, agents: [agent('a', { startedBy: { kind: 'agent', id: 'b' } }), agent('b', { startedBy: { kind: 'agent', id: 'a' } }),
      agent('c', { startedBy: { kind: 'agent', id: 'missing' } }), agent('d', { role: 'future', startedBy: { kind: 'person', id: 'same' } }),
      agent('retired', { retired: true }), agent('visitor', { visitor: true, role: 'secretary' })] }
    const mapped = mapOffice(source, null)
    expect(mapped.occupants).toHaveLength(5)
    for (const id of ['a', 'b', 'c']) expect(mapped.occupants.find(one => one.agent.id === id)).toMatchObject({ team: null, starter: null, relationshipUnavailable: true })
    expect(mapped.occupants.find(one => one.agent.id === 'd')).toMatchObject({ zone: 'unassigned', starter: { kind: 'person', name: 'Reader' } })
    expect(mapped.occupants.find(one => one.agent.id === 'visitor')?.zone).toBe('visitor')
  })
  it('groups a supervisor who started supervisors, without changing role or authority', () => {
    const source = { ...people, agents: [agent('lead', { role: 'supervisor' }), agent('child', { role: 'supervisor', startedBy: { kind: 'agent', id: 'lead' } }), agent('worker', { startedBy: { kind: 'agent', id: 'child' } })] }
    const mapped = mapOffice(source, null)
    expect(mapped.occupants.find(one => one.agent.id === 'lead')?.zone).toBe('leadership')
    expect(mapped.occupants.find(one => one.agent.id === 'child')?.team).toBe('child')
    expect(mapped.occupants.find(one => one.agent.id === 'worker')?.team).toBe('child')
    expect(source.agents[0]?.role).toBe('supervisor')
  })
  it('is deterministic across read ordering; project filtering preserves whole-office seats', () => {
    const mapped = mapOffice(people, work)
    expect(mapOffice({ ...people, agents: [...people.agents].reverse() }, work).seats).toEqual(mapped.seats)
    const before = structuredClone(mapped.seats)
    expect(mapped.occupants.filter(one => inProject(one, 'library')).map(one => one.agent.id)).toEqual(['reed'])
    expect(mapped.seats).toEqual(before)
    expect(mapOffice({ ...people, agents: people.agents.slice(0, 1) }, work).occupants).toHaveLength(1)
  })
  it('joins only supplied agents and counts unmatched work', () => {
    expect(mapOffice(people, { ...work, work: [workRow('orphan', { agent: 'not-returned' })] }).unmatchedWork).toBe(1)
  })
  it('never changes saved scale, null scale or generation role after refresh or role change', () => {
    const source = { ...people, agents: [agent('old', { role: 'secretary', scale: { version: 1, roleAtGeneration: 'worker', value: .4 } }), agent('none', { scale: null })] }
    const before = structuredClone(source)
    for (let index = 0; index < 2; index++) {
      const mapped = mapOffice(source, work)
      expect(mapped.occupants.find(one => one.agent.id === 'old')?.agent.scale).toEqual(before.agents[0]?.scale)
      expect(mapped.occupants.find(one => one.agent.id === 'none')?.agent.scale).toBeNull()
    }
    expect(source).toEqual(before)
  })
  it('validates and preserves legacy, chosen, generated, apron and future appearance values', () => {
    expect(portraitOf(legacy)).toMatchObject({ version: 1, stored: legacy, look: null, unavailable: 'legacy' })
    expect(portraitOf({ ...legacy, top: { item: 'round-glasses', colour: 'blue' } }).unavailable).toBe('unsupported')
    for (const source of ['registration', 'random-preview', 'default-refresh']) {
      const stored = { version: 2, style: 'c-forest', lookId: 'scarf', generation: { source, seed: 'fixture', catalogueVersion: 1, rareItems: false, ...(source === 'default-refresh' ? { batchId: 'batch' } : {}) } }
      expect(portraitOf(stored)).toMatchObject({ version: 2, stored, look: 'scarf' })
    }
    expect(portraitOf(apron)).toMatchObject({ version: 3, stored: apron, look: 'sand-apron' })
    for (const variant of [{ fur: 'grey-brown' }, { cloth: 'blue-grey' }, { accessory: 'gold-halo' }, { body: { x: .94, y: 1.03 } }]) {
      const stored = { ...apron, ...variant }
      expect(portraitOf(stored)).toMatchObject({ version: 3, stored, look: null, unavailable: 'variant' })
    }
    const future = { version: 10, style: 'future', choice: 'keep' }
    expect(portraitOf(future)).toMatchObject({ stored: future, look: null, unavailable: 'unsupported' })
  })
  it('reads an unread work counter as unread and a loaded one as its count', () => {
    const loaded = mapOffice(people, work), occupant = loaded.occupants.find(one => one.work.length > 0)!
    const group = workGroup(occupant.work[0]!)
    expect(partialWorkCount([occupant], null, group)).toBe(1)
    const unread = { ...occupant, facts: { people: { status: 'unloaded' as const, error: null }, work: { status: 'unloaded' as const, error: null } } }
    expect(partialWorkCount([unread], null, group)).toBeNull()
  })
  it('bounds cosmetic contacts and rejects stale or disposed layout jobs', () => {
    expect(CONTACT_LIMITS).toEqual({ active: 4, queued: 16, cacheAgeMs: 15000, targetsPerMessage: 1 })
    const jobs = new LayoutGeneration()
    const first = jobs.next(); const second = jobs.next()
    expect(jobs.accepts(first)).toBe(false); expect(jobs.accepts(second)).toBe(true)
    jobs.cancel(); expect(jobs.accepts(second)).toBe(false)
    const final = jobs.next(); jobs.dispose(); expect(jobs.accepts(final)).toBe(false)
  })
})
