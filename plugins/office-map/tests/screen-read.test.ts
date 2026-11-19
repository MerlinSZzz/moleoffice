// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountReader, OfficeReader } from '../src/bridge.ts'
import type { PluginAsksTheSlot, PluginReadView } from '../src/contracts.ts'
import { readView, readViewSlices } from '../src/read.ts'
import { mapOffice, projectMatch } from '../src/model.ts'
import { occupantCard } from '../src/details.ts'
import { readFailureWords } from '../src/words.ts'
import { AGENT_CHUNK, REFRESH_GRACE_MS, WHOLE_OFFICE_LIMIT, agentIds } from '../src/screen-facts.ts'
import { context } from './fixtures.ts'
// @ts-expect-error Generated fixtures are deliberately shared with the JS browser executor.
import { screenFixture, namedAnswer } from './fixtures/screen-read-fixtures.mjs'

type Ask = Extract<PluginAsksTheSlot, { ask: 'read' }>
function setup(onChanged: () => void = () => {}) {
  const fixture = screenFixture(1000), sent: Ask[] = [], unresolved = new Map<PluginReadView, string>()
  let clock = 0
  const reader = new OfficeReader(message => {
    if (message.ask !== 'read') return
    expect(unresolved.has(message.view), `concurrent ${message.view}`).toBe(false)
    unresolved.set(message.view, message.id); sent.push(message)
  }, onChanged, () => ++clock)
  const asks = (view: PluginReadView) => sent.filter(ask => ask.view === view)
  const answer = (ask: Ask, body: unknown = namedAnswer(fixture, ask.view, ask.query), status = 200, sliced = false) => {
    unresolved.delete(ask.view)
    reader.receive({ interface: 'office-read/1', kind: 'answer', id: ask.id, view: ask.view, status, tag: 'subset-tag', body }, sliced)
  }
  reader.receive(context)
  const drain = () => { for (let turns = 0; unresolved.size && turns < 100; turns++) for (const id of [...unresolved.values()]) answer(sent.find(ask => ask.id === id)!) }
  return { reader, fixture, sent, asks, answer, drain, unresolved, pass: (ms: number) => { clock += ms } }
}
afterEach(() => vi.unstubAllGlobals())

describe('roster and explicit subset protocol', () => {
  it('starts with four light views, never whole people/work; declared roster projects only public identity', () => {
    const f = setup()
    expect(f.sent.map(ask => ask.view)).toEqual(['projects', 'roster', 'online', 'asleep'])
    f.drain(); f.reader.refresh(); f.drain()
    expect(f.asks('people')).toEqual([]); expect(f.asks('work')).toEqual([])
    const raw = { ...f.fixture.views.roster, narrowedByPermission: f.fixture.views.people.narrowedByPermission, agents: f.fixture.views.people.agents }
    const parsed = readView('roster', raw)!
    expect(Object.keys(parsed.agents[0]!)).toEqual(['kind', 'id', 'handle', 'name', 'role', 'retired', 'visitor', 'startedBy', 'createdAt'])
    expect(parsed.agents.map(row => row.id)).toEqual(f.fixture.views.roster.agents.map((row: { id: string }) => row.id))
    const sliced = readViewSlices('roster', raw); let next = sliced.next(); while (!next.done) next = sliced.next()
    expect(next.value).toEqual(parsed)
    const malformed = structuredClone(raw); delete malformed.agents.at(-1).startedBy
    expect(readView('roster', malformed)).toBeNull()
    const badSlices = readViewSlices('roster', malformed); let bad = badSlices.next(); while (!bad.done) bad = badSlices.next()
    expect(bad.value).toBeNull()
    const withoutPermission = structuredClone(raw); delete withoutPermission.narrowedByPermission
    expect(readView('roster', withoutPermission)).toBeNull()
    const missingSlices = readViewSlices('roster', withoutPermission); let missing = missingSlices.next(); while (!missing.done) missing = missingSlices.next()
    expect(missing.value).toBeNull()
  })
  it('validates and deduplicates IDs, handles explicit empty fixtures, preserves whole-view row order and asked absence order', () => {
    expect(agentIds(['a', 'b', 'a'])).toEqual(['a', 'b'])
    for (const id of ['', 'a,b', 'a b', 'é', 'x'.repeat(65)]) expect(() => agentIds([id])).toThrow()
    const f = setup(), ids = f.fixture.views.roster.agents.map((row: { id: string }) => row.id)
    const answer = namedAnswer(f.fixture, 'people', { agents: [ids[9], 'absent2', ids[1], 'absent1', ids[9]].join(',') })
    expect(answer.agents.map((row: { id: string }) => row.id)).toEqual([ids[1], ids[9]])
    expect(answer.notAgents).toEqual(['absent2', 'absent1'])
    expect(namedAnswer(f.fixture, 'people', { agents: '' }).agents).toEqual([])
    expect(namedAnswer(f.fixture, 'people', { agents: '' }).people).toEqual(f.fixture.views.people.people)
    expect(namedAnswer(f.fixture, 'work', { agents: '' }).work).toEqual([])
    expect(() => namedAnswer(f.fixture, 'work', { agents: ids.slice(0, 501).join(',') })).toThrow()
  })
  it('chunks both views under 20 IDs and the encoded request bound with one in flight, loading every requested ID', () => {
    const f = setup(); f.drain()
    const ids = f.fixture.views.roster.agents.map((row: { id: string }) => row.id)
    f.reader.selectAgents([...ids, ids[0]])
    expect(f.asks('people')).toHaveLength(1); expect(f.asks('work')).toHaveLength(1)
    f.drain()
    for (const view of ['people', 'work'] as const) {
      const asks = f.asks(view)
      expect(asks.length).toBeGreaterThan(1)
      expect(asks.flatMap(ask => String(ask.query?.['agents']).split(','))).toEqual(ids)
      expect(asks.every(ask => String(ask.query?.['agents']).split(',').length <= 20)).toBe(true)
      expect(asks.every(ask => !('tag' in ask))).toBe(true)
      for (const ask of asks) {
        const query = new URLSearchParams(Object.entries(ask.query ?? {}).map(([key, value]) => [key, String(value)]))
        expect(Buffer.byteLength(`/api/plugin-read/v1/${encodeURIComponent(ask.view)}?${query.toString()}`, 'ascii')).toBeLessThanOrEqual(8192)
      }
    }
    expect(Object.keys(f.reader.snapshot().facts)).toHaveLength(ids.length)
    expect(Object.values(f.reader.snapshot().facts).every(fact => fact.people.status === 'loaded' && fact.work.status === 'loaded')).toBe(true)
  })
  it('keeps the selected queue whole when a listener throws during a replaced in-flight selection', () => {
    let throwOnNextChange = false
    const f = setup(() => {
      if (!throwOnNextChange) return
      throwOnNextChange = false
      throw new TypeError('Generator is already running')
    })
    f.drain()
    const ids: string[] = f.fixture.views.roster.agents.slice(0, AGENT_CHUNK + 1).map((row: { id: string }) => row.id)
    expect(ids.length).toBeGreaterThan(AGENT_CHUNK)
    const assertCurrent = () => {
      const facts = f.reader.snapshot().facts, revisions = new Set<number>()
      for (const id of ids) {
        const fact = facts[id]
        expect(fact, id).toBeDefined()
        expect(fact!.people.status, id).toBe('loaded')
        expect(fact!.work.status, id).toBe('loaded')
        expect(fact!.people.error, id).toBeNull()
        expect(fact!.work.error, id).toBeNull()
        expect(fact!.people.pending, id).toBe(false)
        expect(fact!.work.pending, id).toBe(false)
        expect(fact!.people.revision, id).toBe(fact!.work.revision)
        expect(fact!.people.revision, id).toBeGreaterThanOrEqual(1)
        revisions.add(fact!.people.revision!)
      }
      expect(revisions.size).toBe(1)
    }
    f.reader.selectAgents(ids)
    f.drain()
    assertCurrent()
    f.reader.refresh()
    f.drain()
    assertCurrent()
    const second = [...ids].reverse(), third = [...ids.slice(1), ids[0]!]
    f.reader.selectAgents(second)
    expect(f.unresolved.size).toBeGreaterThan(0)
    throwOnNextChange = true
    expect(() => f.reader.selectAgents(third)).toThrow(TypeError)
    f.drain()
    assertCurrent()
  })
  it('replaces A->B->C while preserving both singleton cards, rejects stale A and refreshes only C plus the open card', () => {
    const f = setup(); f.drain()
    const ids = f.fixture.views.roster.agents.map((row: { id: string }) => row.id), [a, b, c, card1, card2] = ids
    f.reader.selectAgents([a]); const old = f.asks('people').at(-1)!
    f.reader.selectAgents([b]); f.reader.requestCard(card1); f.reader.selectAgents([c]); f.reader.requestCard(card2)
    f.drain()
    expect(f.asks('people').map(ask => ask.query?.['agents'])).toEqual([a, card1, card2, c])
    expect(f.asks('work').map(ask => ask.query?.['agents'])).toEqual([a, card1, card2, c])
    expect(f.reader.snapshot().facts[a]?.people.status).toBe('unloaded'); expect(f.reader.snapshot().facts[b]?.people.status).toBe('unloaded')
    expect(f.reader.snapshot().facts[c]?.people.status).toBe('loaded')
    f.reader.receive({ interface: 'office-read/1', kind: 'answer', id: old.id, view: 'people', status: 200, tag: 'old', body: f.fixture.views.people })
    expect(f.reader.snapshot().facts[a]?.people.status).toBe('unloaded')
    const start = f.sent.length; f.reader.refresh(); f.drain()
    expect(f.sent.slice(start).filter(ask => ask.view === 'people').map(ask => ask.query?.['agents'])).toEqual([card2, c])
    f.reader.requestCard(null); f.reader.selectAgents([]); f.drain()
    const before = f.asks('people').length; f.reader.refresh(); f.drain()
    expect(f.asks('people')).toHaveLength(before)
  })
  it('reads every agent on a map of at most the limit once, by name and after the screen, so the work counters are whole without the view moving', () => {
    const f = setup(); f.drain()
    const all: string[] = f.fixture.views.roster.agents.map((row: { id: string }) => row.id)
    const ids = all.slice(0, WHOLE_OFFICE_LIMIT), screen = ids.slice(0, 9), later = ids.slice(50, 59)
    const askedSince = (start: number, view: 'people' | 'work') => f.sent.slice(start).filter(ask => ask.view === view).map(ask => String(ask.query?.['agents']).split(','))
    f.reader.selectAgents(screen); f.reader.selectRoster(ids); f.drain()
    for (const view of ['people', 'work'] as const) {
      const asked = askedSince(0, view)
      expect(asked[0], 'the screen first').toEqual(screen)
      expect(asked.slice(1).flat(), 'then every other agent once').toEqual(ids.slice(9))
      expect(asked.every(chunk => chunk.length <= AGENT_CHUNK)).toBe(true)
    }
    const unread = (reader: OfficeReader) => ids.filter(id => { const fact = reader.snapshot().facts[id]; return fact?.people.status !== 'loaded' || fact.work.status !== 'loaded' || fact.people.pending || fact.work.pending })
    expect(unread(f.reader)).toEqual([])
    // A move of the view reads only the new screen, and the same map reads nobody again.
    let start = f.sent.length
    f.reader.selectAgents(later); f.reader.selectRoster([...ids]); f.drain()
    expect(askedSince(start, 'people')).toEqual([later])
    // The screen's agents still come before the rest when the whole map is asked for first.
    const g = setup(); g.drain()
    g.reader.selectRoster(ids); g.reader.selectAgents(later); g.drain()
    expect(g.asks('people').slice(0, 2).map(ask => String(ask.query?.['agents']).split(',')), 'the screen goes ahead of the rest of the map').toEqual([ids.slice(0, AGENT_CHUNK), later])
    expect(unread(g.reader), 'the chunk asked before the move still counts').toEqual([])
    // Refresh reads the screen first and then every other agent once more.
    start = f.sent.length; f.reader.refresh(); f.drain()
    for (const view of ['people', 'work'] as const) {
      const asked = askedSince(start, view)
      expect(asked[0]).toEqual(later)
      expect(asked.flat().sort()).toEqual([...ids].sort())
    }
    expect(unread(f.reader)).toEqual([])
    // A larger office is read only by screen, at the first read and at Refresh.
    const h = setup(); h.drain()
    h.reader.selectAgents(screen); h.reader.selectRoster(all.slice(0, WHOLE_OFFICE_LIMIT + 1)); h.drain(); h.reader.refresh(); h.drain()
    for (const view of ['people', 'work'] as const) expect(h.asks(view).map(ask => String(ask.query?.['agents']).split(',')), `${view} over the limit`).toEqual([screen, screen])
  })
  it('keeps absent, unloaded and loaded distinct on malformed/transport/304 paths; never reuses a subset tag', () => {
    const f = setup(); f.drain()
    const id = f.fixture.views.roster.agents[0].id, other = f.fixture.views.roster.agents[1].id
    f.reader.selectAgents([id, 'missing']); f.drain()
    expect(f.reader.snapshot().facts.missing?.people.status).toBe('absent')
    expect(f.reader.snapshot().facts.missing?.work.status).toBe('absent')
    f.reader.selectAgents([other]); expect(f.asks('people').at(-1)).not.toHaveProperty('tag')
    f.answer(f.asks('people').at(-1)!, null, 304)
    expect(f.reader.snapshot().facts[other]?.people).toMatchObject({ status: 'unloaded', error: 'read', pending: false })
    f.answer(f.asks('work').at(-1)!, null, 500)
    expect(f.reader.snapshot().facts[other]?.work.status).toBe('unloaded')
    f.reader.selectAgents([id]); f.drain(); f.reader.refresh()
    f.answer(f.asks('people').at(-1)!, { ...f.fixture.views.people, notAgents: [] }) // Unrequested rows invalidate the whole chunk.
    f.answer(f.asks('work').at(-1)!, null, 304)
    expect(f.reader.snapshot().facts[id]?.people).toMatchObject({ status: 'loaded', error: 'read' })
    expect(f.reader.snapshot().facts[id]?.work).toMatchObject({ status: 'loaded', error: 'read' })
    f.reader.selectAgents(['new-id']); f.answer(f.asks('people').at(-1)!, { ...f.fixture.views.people, agents: [], notAgents: [] })
    expect(f.reader.snapshot().facts['new-id']?.people.status).toBe('unloaded')
    f.answer(f.asks('work').at(-1)!, { ...f.fixture.views.work, work: [], notAgents: ['not-asked'] })
    expect(f.reader.snapshot().facts['new-id']?.work.status).toBe('unloaded')
  })
  it.each(['unloaded', 'loaded', 'absent'] as const)('shows too-long bytes/limit for the affected %s agent, retaining cached facts without retry', status => {
    const f = setup(); f.drain()
    const [id, other] = f.fixture.views.roster.agents.map((row: { id: string }) => row.id)
    f.reader.selectAgents([other]); f.drain()
    const unaffected = f.reader.snapshot().facts[other]
    if (status !== 'unloaded') {
      f.reader.selectAgents([id])
      for (const view of ['people', 'work'] as const) {
        const body = status === 'absent' ? { ...f.fixture.views[view], [view === 'people' ? 'agents' : 'work']: [], notAgents: [id] } : undefined
        f.answer(f.asks(view).at(-1)!, body)
      }
      f.reader.refresh()
    } else f.reader.selectAgents([id])
    const ask = f.asks('people').at(-1)!, before = f.asks('people').length
    const previous = f.reader.snapshot().facts[id]!.people
    f.unresolved.delete('people')
    f.reader.receive({ interface: 'office-read/1', kind: 'refused', id: ask.id, view: 'people', why: 'too-long', bytes: 12000, limit: 8192 })
    const fact = f.reader.snapshot().facts[id]!.people
    expect(fact).toMatchObject({ status, error: 'read', pending: false, failure: { why: 'too-long', bytes: 12000, limit: 8192 } })
    if (previous.status !== 'unloaded') expect(fact).toMatchObject(previous.status === 'loaded' ? { value: previous.value, receivedAt: previous.receivedAt } : { receivedAt: previous.receivedAt })
    expect(f.reader.snapshot().facts[other]!.people.failure).toBe(unaffected!.people.failure)
    expect(f.reader.snapshot().views.people.error).toBe('read')
    expect(f.asks('people')).toHaveLength(before)
    // Exercise the actual card renderer, including the loaded-but-stale branch.
    class CardNode {
      textContent = ''; className = ''; dataset = {}; style = {}; children: CardNode[] = []
      get childElementCount() { return this.children.length }
      append(...nodes: CardNode[]) { this.children.push(...nodes) }
      setAttribute() {}
    }
    vi.stubGlobal('document', { createElement: () => new CardNode(), createTextNode: (text: string) => Object.assign(new CardNode(), { textContent: text }) })
    const text = (node: CardNode): string => [node.textContent, ...node.children.map(text)].join(' ')
    const roster = readView('roster', f.fixture.views.roster)!
    const occupant = mapOffice(roster, null, null, f.reader.snapshot().facts).occupants.find(one => one.agent.id === id)!
    for (const language of ['en', 'zh'] as const) {
      const snapshot = { ...f.reader.snapshot(), context: { ...context, language } }
      const visible = text(occupantCard(occupant, snapshot, null) as unknown as CardNode)
      expect(visible).toContain(readFailureWords(language, fact.failure))
      expect(visible).toContain('12000'); expect(visible).toContain('8192')
      expect(visible).not.toContain('Access refused')
    }
    f.answer(f.asks('work').at(-1)!)
    f.reader.refresh(); expect(f.asks('people')).toHaveLength(before + 1)
    f.answer(f.asks('people').at(-1)!)
    expect(f.reader.snapshot().facts[id]!.people).toMatchObject({ status: 'loaded', error: null, pending: false })
    expect(f.reader.snapshot().facts[id]!.people.failure).toBeUndefined()
  })
  it.each([
    { kind: 'answer', status: '200', tag: null },
    { kind: 'answer', status: 200, view: 'work' },
    { kind: 'refused', why: 'could-not-ask' },
    { kind: 'refused', why: 'too-long', bytes: 1.5, limit: 8192 },
  ])('settles a malformed matching subset without stranding or failing another lane: %j', patch => {
    const f = setup(); f.drain(); const [id, next] = f.fixture.views.roster.agents.map((row: { id: string }) => row.id)
    f.reader.selectAgents([id]); const ask = f.asks('people').at(-1)!
    f.unresolved.delete('people')
    f.reader.receive({ interface: 'office-read/1', id: ask.id, view: ask.view, ...patch })
    expect(f.reader.snapshot().facts[id]!.people).toMatchObject({ status: 'unloaded', error: 'read', pending: false })
    expect(f.reader.snapshot().facts[id]!.work.pending).toBe(true)
    expect(f.asks('people')).toHaveLength(1)
    f.reader.selectAgents([next]); expect(f.asks('people')).toHaveLength(2)
    f.drain(); expect(f.reader.snapshot().facts[next]!.people.status).toBe('loaded')
  })
  it('does not confuse no work with absent and clears all facts on access refusal, context change, pause and disposal', () => {
    const f = setup(); f.drain(); const id = f.fixture.views.roster.agents[0].id
    f.reader.selectAgents([id]); f.answer(f.asks('people').at(-1)!)
    f.answer(f.asks('work').at(-1)!, { ...f.fixture.views.work, work: [], notAgents: [] })
    expect(f.reader.snapshot().facts[id]?.work).toMatchObject({ status: 'loaded', value: [] })
    f.reader.refresh(); const old = f.asks('work').at(-1)!
    f.answer(f.asks('people').at(-1)!, null, 403)
    expect(Object.keys(f.reader.snapshot().facts)).toEqual([])
    f.answer(old); expect(Object.keys(f.reader.snapshot().facts)).toEqual([])
    f.reader.receive({ ...context, theme: 'dark' }); f.drain(); f.reader.selectAgents([id]); f.drain()
    expect(f.reader.snapshot().facts[id]?.people.status).toBe('loaded')
    f.reader.setActive(false); expect(Object.keys(f.reader.snapshot().facts)).toEqual([])
    f.reader.setActive(true); f.drain(); f.reader.selectAgents([id]); f.drain()
    f.reader.receive({ ...context, project: 'new-context' }); expect(Object.keys(f.reader.snapshot().facts)).toEqual([])
    f.drain(); f.reader.selectAgents([id]); f.drain(); f.reader.dispose()
    expect(Object.keys(f.reader.snapshot().facts)).toEqual([])
  })
  it('cancels a sliced decode without publishing partial facts or losing the next generation request', () => {
    const turns: (() => void)[] = [], ports: { close: ReturnType<typeof vi.fn> }[] = []
    vi.stubGlobal('MessageChannel', class {
      port1 = { onmessage: null as (() => void) | null, close: vi.fn() }
      port2 = { postMessage: () => turns.push(() => this.port1.onmessage?.()), close: vi.fn() }
      constructor() { ports.push(this.port1, this.port2) }
    })
    const f = setup(); f.drain(); const ids = f.fixture.views.roster.agents.slice(0, 500).map((row: { id: string }) => row.id)
    f.reader.selectAgents(ids); f.answer(f.asks('people').at(-1)!, undefined, 200, true)
    expect(Object.values(f.reader.snapshot().facts).every(one => one.people.status === 'unloaded')).toBe(true)
    turns.shift()!(); f.reader.receive({ ...context, language: 'zh' })
    while (turns.length) turns.shift()!()
    expect(Object.keys(f.reader.snapshot().facts)).toEqual([])
    expect(ports.every(port => port.close.mock.calls.length === 1)).toBe(true)
    f.drain(); f.reader.selectAgents([ids[0]]); f.drain()
    expect(f.reader.snapshot().facts[ids[0]]?.people.status).toBe('loaded')
    f.reader.dispose()
  })
  it('revalidates refresh and A->B->A with a coherent current pair while preserving explicitly stale appearance', () => {
    const f = setup(); f.drain(); const [a, b] = f.fixture.views.roster.agents.map((row: { id: string }) => row.id)
    const roster = readView('roster', { ...f.fixture.views.roster, narrowedByPermission: f.fixture.views.people.narrowedByPermission })!
    const current = () => mapOffice(roster, null, null, f.reader.snapshot().facts).occupants.find(one => one.agent.id === a)!
    const project = f.fixture.views.people.agents[0].projects[0]
    f.reader.selectAgents([a]); f.drain(); expect(projectMatch(current(), project)).toBe('match')
    // A refresh shows the previous facts for the grace, so one that ends within it shows no stale frame.
    f.reader.refresh(); expect(projectMatch(current(), project)).toBe('match')
    f.pass(REFRESH_GRACE_MS); expect(projectMatch(current(), project)).toBe('unknown')
    expect(current().agent.scale).toEqual(f.fixture.views.people.agents[0].scale)
    f.answer(f.asks('people').at(-1)!); expect(projectMatch(current(), project)).toBe('unknown')
    f.answer(f.asks('work').at(-1)!, null, 500); expect(projectMatch(current(), project)).toBe('unknown')
    f.reader.selectAgents([b]); f.drain(); f.reader.refresh(); f.drain(); expect(projectMatch(current(), project)).toBe('unknown'); const before = f.asks('people').length
    f.reader.selectAgents([a]); expect(f.asks('people')).toHaveLength(before + 1)
    expect(projectMatch(current(), project)).toBe('unknown')
    f.answer(f.asks('work').at(-1)!); expect(projectMatch(current(), project)).toBe('unknown')
    f.answer(f.asks('people').at(-1)!); expect(projectMatch(current(), project)).toBe('match')
    f.reader.refresh(); f.pass(REFRESH_GRACE_MS); f.answer(f.asks('people').at(-1)!, { ...f.fixture.views.people, agents: [], notAgents: [a] })
    expect(projectMatch(current(), null)).toBe('absent')
    f.answer(f.asks('work').at(-1)!); expect(projectMatch(current(), null)).toBe('absent')
  })
  it('rejects a delayed prior card revision after refresh, then drains both fresh singleton views', () => {
    const f = setup(); f.drain(); const id = f.fixture.views.roster.agents[0].id
    f.reader.requestCard(id); const oldPeople = f.asks('people').at(-1)!, oldWork = f.asks('work').at(-1)!
    f.reader.refresh()
    f.answer(oldPeople); expect(f.reader.snapshot().facts[id]?.people.status).toBe('unloaded')
    f.answer(f.asks('people').at(-1)!); expect(f.reader.snapshot().facts[id]?.people.status).toBe('loaded')
    f.answer(oldWork); expect(f.reader.snapshot().facts[id]?.work.status).toBe('unloaded')
    f.answer(f.asks('work').at(-1)!)
    const state = f.reader.snapshot().facts[id]!
    expect(state.people.pending).toBe(false); expect(state.work.pending).toBe(false)
    expect(state.people.revision).toBe(state.work.revision)
    expect(f.asks('people').map(ask => ask.query?.['agents'])).toEqual([id, id])
    expect(f.asks('work').map(ask => ask.query?.['agents'])).toEqual([id, id])
  })
  it('treats every legal registry ID as data, including object property names, through refresh and errors', () => {
    const f = setup(); f.drain()
    f.reader.selectAgents(['constructor', '__proto__', 'toString']); f.drain()
    for (const id of ['constructor', '__proto__', 'toString']) {
      expect(f.reader.snapshot().facts[id]?.people.status).toBe('absent')
      expect(f.reader.snapshot().facts[id]?.work.status).toBe('absent')
    }
    f.reader.refresh(); f.drain()
    expect(Object.getPrototypeOf(f.reader.snapshot().facts)).toBeNull()
    expect(Object.keys(f.reader.snapshot().facts)).toEqual(['constructor', '__proto__', 'toString'])
  })
  it('keeps 500 distinct 64-character IDs in bounded encoded requests and drains both views exactly', () => {
    const f = setup(), rename = new Map<string, string>()
    for (const agent of f.fixture.views.roster.agents) rename.set(agent.id, agent.id.padEnd(64, 'x'))
    for (const agent of f.fixture.views.people.agents) agent.id = rename.get(agent.id)!
    for (const row of f.fixture.views.work.work) row.agent = rename.get(row.agent) ?? row.agent
    for (const agent of f.fixture.views.roster.agents) agent.id = rename.get(agent.id)!
    const ids: string[] = f.fixture.views.roster.agents.slice(0, 500).map((row: { id: string }) => row.id)
    expect(new Set(ids).size).toBe(500)
    expect(ids.every((id: string) => id.length === 64)).toBe(true)
    f.reader.selectAgents(ids)
    f.drain()
    for (const view of ['people', 'work'] as const) {
      const asks = f.asks(view), asked = asks.flatMap(ask => String(ask.query?.['agents'] ?? '').split(',').filter(Boolean))
      expect(asked).toEqual(ids)
      expect(asks.length).toBeGreaterThan(1)
      for (const ask of asks) {
        expect(String(ask.query?.['agents']).split(',').length).toBeLessThanOrEqual(500)
        const query = new URLSearchParams(Object.entries(ask.query ?? {}).map(([key, value]) => [key, String(value)]))
        const encoded = `/api/plugin-read/v1/${encodeURIComponent(ask.view)}?${query.toString()}`
        expect(Buffer.byteLength(encoded, 'ascii')).toBeLessThanOrEqual(8192)
      }
    }
    for (const id of ids) {
      expect(f.reader.snapshot().facts[id]?.people.status).toBe('loaded')
      expect(f.reader.snapshot().facts[id]?.work.status).toBe('loaded')
    }
  })
  it('mounts the screen policy so production cannot regress to automatic whole heavy reads', () => {
    const sent: PluginAsksTheSlot[] = [], handlers = new Map<string, (event: unknown) => void>()
    const parent = { postMessage: (message: PluginAsksTheSlot) => sent.push(message) }
    const target = { parent, addEventListener: (name: string, fn: (event: unknown) => void) => handlers.set(name, fn), removeEventListener: () => {} }
    const document = { hidden: false, addEventListener: () => {}, removeEventListener: () => {} }
    const mounted = mountReader(target as unknown as Window, document as unknown as Document, () => {})
    handlers.get('message')!({ source: parent, data: context })
    expect(sent.filter((ask): ask is Ask => ask.ask === 'read').map(ask => ask.view)).toEqual(['projects', 'roster', 'online', 'asleep'])
    mounted.dispose()
  })
})
