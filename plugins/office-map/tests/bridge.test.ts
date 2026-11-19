// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it, vi } from 'vitest'
import { readView, readViewSlices } from '../src/read.ts'
import type { PluginAsksTheSlot, PluginReadView } from '../src/contracts.ts'
import { mountReader, OfficeReader, type BridgeSnapshot } from '../src/bridge.ts'
import { context, people, projects, talk, work } from './fixtures.ts'

type Read = Extract<PluginAsksTheSlot, { ask: 'read' }>
function fixture() {
  const sent: PluginAsksTheSlot[] = []
  const changed: BridgeSnapshot[] = []
  let now = 100
  const reader = new OfficeReader(message => sent.push(message), snapshot => changed.push(snapshot), () => ++now, false)
  const asks = (view: PluginReadView): Read[] => sent.filter((one): one is Read => one.ask === 'read' && one.view === view)
  const last = (view: PluginReadView): Read => asks(view).at(-1)!
  const answer = (view: PluginReadView, body: unknown, status = 200, tag: string | null = 'tag', id = last(view).id) => reader.receive({
    interface: 'office-read/1', kind: 'answer', id, view, status, tag, body,
  })
  const all = () => { answer('projects', projects); answer('people', people); answer('work', work); answer('talk', talk()) }
  reader.setTalkOpen(true); reader.start(); reader.receive(context)
  return { reader, sent, changed, asks, last, answer, all }
}

describe('ready and declared read protocol', () => {
  it('validates large answers in batches of 32, preserves projection and rejects a bad final row atomically', () => {
    const body = { ...people, agents: Array.from({ length: 97 }, (_, i) => ({ ...people.agents[0]!, id: `a-${i}`, extra: 'not published' })) }
    const slices = readViewSlices('people', body)
    let next = slices.next(), turns = 0
    while (!next.done) { turns++; next = slices.next() }
    expect(turns).toBe(1 + 4) // One people batch, then four agent batches.
    expect(next.value).toEqual(readView('people', body))
    expect(next.value?.agents[0]).not.toHaveProperty('extra')
    const bad = readViewSlices('people', { ...body, agents: [...body.agents, { ...body.agents[0], id: '' }] })
    let result = bad.next()
    while (!result.done) result = bad.next()
    expect(result.value).toBeNull()
  })
  it('defers decoding, keeps a request in flight, and cancels partial private data on context change and close', () => {
    const turns: (() => void)[] = [], ports: { close: ReturnType<typeof vi.fn> }[] = []
    vi.stubGlobal('MessageChannel', class {
      port1 = { onmessage: null as (() => void) | null, close: vi.fn() }
      port2 = { postMessage: () => turns.push(() => this.port1.onmessage?.()), close: vi.fn() }
      constructor() { ports.push(this.port1, this.port2) }
    })
    try {
      const f = fixture(), body = { ...people, agents: Array.from({ length: 10000 }, () => people.agents[0]!) }
      const id = f.last('people').id
      f.reader.receive({ interface: 'office-read/1', kind: 'answer', id, view: 'people', status: 200, tag: 'private', body }, true)
      expect(f.reader.snapshot().views.people.data).toBeNull()
      f.reader.refresh(); expect(f.last('people').id).toBe(id)
      turns.shift()!(); expect(f.reader.snapshot().views.people.data).toBeNull()
      f.reader.receive({ ...context, project: 'new-context' })
      expect(f.last('people').id).not.toBe(id)
      expect(ports.every(port => port.close.mock.calls.length === 1)).toBe(true)
      while (turns.length) turns.shift()!()
      expect(f.reader.snapshot().views.people.data).toBeNull()
      f.reader.receive({ interface: 'office-read/1', kind: 'answer', id: f.last('people').id, view: 'people', status: 200, tag: 'private', body }, true)
      f.reader.dispose()
      while (turns.length) turns.shift()!()
      expect(f.reader).toMatchObject({ decoding: new Map(), pending: new Map() })
      expect(ports.every(port => port.close.mock.calls.length === 1)).toBe(true)
      expect(f.reader.snapshot().views.people.data).toBeNull()
    } finally { vi.unstubAllGlobals() }
  })
  it('parses an answer with only the answer schema, never the context or refusal schema', () => {
    const f = fixture()
    const answer = { interface: 'office-read/1', kind: 'answer', id: f.last('people').id, view: 'people', status: 200, tag: 'tag', body: people }
    const read = new Set<string>()
    const watched = new Proxy(answer, {
      get(target, key, receiver) { read.add(String(key)); return Reflect.get(target, key, receiver) },
      has(target, key) { read.add(String(key)); return Reflect.has(target, key) },
    })
    f.reader.receive(watched)
    // The answer schema reads all of its own fields, so the watch is known to see reads.
    for (const key of ['interface', 'kind', 'id', 'view', 'status', 'tag', 'body']) expect(read.has(key)).toBe(true)
    // Fields only the context or refusal schema declares are never read from an answer.
    for (const key of ['plugin', 'page', 'language', 'theme', 'reducedMotion', 'project', 'why', 'said']) expect(read.has(key)).toBe(false)
    expect(f.reader.snapshot().views.people.data).toEqual(people)
  })
  it('settles too-long without said as a read failure, retains bytes/limit and permits only explicit retry', () => {
    const f = fixture(); f.all(); f.reader.refresh()
    const before = f.asks('people').length, receipt = f.reader.snapshot().views.people.receivedAt
    f.reader.receive({ interface: 'office-read/1', kind: 'refused', id: f.last('people').id, view: 'people', why: 'too-long', bytes: 12000, limit: 8192 })
    expect(f.reader.snapshot().views.people).toMatchObject({ status: 'stale', error: 'read', data: people, receivedAt: receipt, tag: null, failure: { why: 'too-long', bytes: 12000, limit: 8192 } })
    expect(f.reader.snapshot().views.work.data).toEqual(work)
    expect(f.asks('people')).toHaveLength(before)
    f.reader.refresh(); expect(f.asks('people')).toHaveLength(before + 1)
    f.answer('people', people); expect(f.reader.snapshot().views.people).toMatchObject({ status: 'ready', error: null, failure: null })
  })
  it.each([
    { kind: 'answer', status: '200', tag: null, body: people },
    { kind: 'answer', status: 200, body: people },
    { kind: 'answer', status: 200, tag: null, body: people, view: null },
    { kind: 'answer', status: 200, tag: null, body: people, view: 'work' },
    { kind: 'refused', why: 'could-not-ask' },
    { kind: 'refused', why: 'unknown-reason', said: 'Unrecognized refusal' },
    { kind: 'refused', why: 'too-long', bytes: '12000', limit: 8192 },
    { kind: 'refused', why: 'too-long', bytes: 12000, limit: -1 },
  ])('settles a malformed matching envelope as visible failure: %j', patch => {
    const f = fixture(), before = f.asks('people').length
    f.reader.receive({ interface: 'office-read/1', id: f.last('people').id, view: 'people', ...patch })
    expect(f.reader.snapshot().views.people).toMatchObject({ status: 'unavailable', error: 'invalid', tag: null })
    expect(f.reader.snapshot().views.work).toMatchObject({ status: 'loading', error: null })
    expect(f.asks('people')).toHaveLength(before)
    f.reader.refresh(); expect(f.asks('people')).toHaveLength(before + 1)
  })
  it('ignores unrelated malformed messages and drains an old-generation malformed answer without publishing it', () => {
    const f = fixture(), id = f.last('people').id
    for (const patch of [{ id: 'unissued' }, { id: null }, { interface: 'other/1' }, { kind: 'unrelated' }]) {
      f.reader.receive({ interface: 'office-read/1', kind: 'answer', id, view: 'people', status: 'broken', ...patch })
      expect(f.reader.snapshot().views.people).toMatchObject({ status: 'loading', error: null })
    }
    f.reader.receive({ ...context, project: 'changed-context' })
    f.reader.receive({ interface: 'office-read/1', kind: 'answer', id, view: 'people', status: 'broken' })
    expect(f.last('people').id).not.toBe(id)
    expect(f.reader.snapshot().views.people).toMatchObject({ status: 'loading', data: null, error: null })
    f.answer('people', people); expect(f.reader.snapshot().views.people.status).toBe('ready')
  })
  it('says ready before reading, then asks only the six declared views it reads whole once each', () => {
    const f = fixture()
    expect(f.sent[0]).toEqual({ interface: 'office-read/1', ask: 'ready' })
    expect(f.sent.slice(1).map(one => one.ask === 'read' ? one.view : null)).toEqual(['projects', 'people', 'work', 'talk', 'online', 'asleep'])
    expect(f.last('talk').query).toEqual({ start: 'latest' })
    f.reader.refresh(); f.reader.receive(context)
    expect(f.sent).toHaveLength(7)
    f.all()
    expect(f.reader.snapshot().views.people.data).toEqual(people)
    expect(f.reader.snapshot().views.work.data).toEqual(work)
    expect(f.reader.snapshot().views.people.receivedAt).toBeTypeOf('number')
    expect(f.reader.snapshot().views.work.receivedAt).not.toBe(f.reader.snapshot().views.people.receivedAt)
  })
  it('accepts 304 with no body only when this generation already holds data and a tag', () => {
    const f = fixture()
    f.answer('people', null, 304)
    expect(f.reader.snapshot().views.people.status).toBe('unavailable')
    f.reader.refresh(); f.answer('people', people)
    f.reader.refresh(); expect(f.last('people').tag).toBe('tag')
    f.answer('people', null, 304)
    expect(f.reader.snapshot().views.people.status).toBe('ready')
    expect(f.reader.snapshot().views.people.data).toEqual(people)
    f.reader.refresh(); f.answer('people', { not: 'empty' }, 304)
    expect(f.reader.snapshot().views.people.status).toBe('stale')
  })
  it('clears private data immediately on any changed context and waits out old in-flight reads', () => {
    const f = fixture()
    const old = f.last('people')
    f.answer('work', work)
    f.reader.receive({ ...context, project: 'library', language: 'zh', theme: 'dark', reducedMotion: true })
    expect(f.reader.snapshot().views.work.data).toBeNull()
    expect(f.asks('people')).toHaveLength(1)
    f.answer('people', people, 200, 'old-private-tag', old.id)
    expect(f.reader.snapshot().views.people.data).toBeNull()
    expect(f.asks('people')).toHaveLength(2)
    expect(f.last('people')).not.toHaveProperty('tag')
    f.answer('people', { ...people, agents: [] })
    expect(f.reader.snapshot().views.people.data?.agents).toEqual([])
  })
  it('drops old-context tags on language, theme and reduced-motion changes too', () => {
    for (const patch of [{ language: 'zh' }, { theme: 'dark' }, { reducedMotion: true }]) {
      const f = fixture(); f.all()
      f.reader.receive({ ...context, ...patch })
      for (const view of ['projects', 'people', 'work', 'talk'] as const) {
        expect(f.reader.snapshot().views[view].data).toBeNull()
        expect(f.last(view)).not.toHaveProperty('tag')
      }
    }
  })
  it('ignores foreign plugin contexts, answers without a matching id, and wrong-view bodies', () => {
    const f = fixture()
    f.reader.receive({ ...context, plugin: 'other' })
    expect(f.reader.snapshot().context?.plugin).toBe('office-map')
    f.answer('people', people, 200, 'tag', 'not-this-request')
    expect(f.reader.snapshot().views.people.data).toBeNull()
    f.answer('people', work)
    expect(f.reader.snapshot().views.people.error).toBe('invalid')
  })
  it('clears all cached joins after permission refusal, including late private answers', () => {
    const f = fixture(); f.all(); f.reader.refresh()
    const oldWork = f.last('work')
    f.answer('people', { error: 'no access' }, 403)
    expect(f.reader.snapshot().views.people.error).toBe('permission')
    for (const state of Object.values(f.reader.snapshot().views)) expect(state.data).toBeNull()
    f.answer('work', work, 200, 'private', oldWork.id)
    expect(f.reader.snapshot().views.work.data).toBeNull()
    expect(f.last('work')).not.toHaveProperty('tag')
  })
  it('uses only the person-visible or agent-only roster supplied, without invisible presence choices', () => {
    const f = fixture(); f.answer('people', people)
    expect(f.reader.snapshot().views.people.data?.people).toEqual(people.people)
    f.reader.refresh()
    const restricted = {
      ...people, people: [], agents: [{ ...people.agents[0], presence: [{ project: 'garden', colour: 'grey', word: 'No recent signal', invisibleChoice: true }] }],
      narrowedByPermission: [{ cause: 'permission', bucket: 'people', count: 1, ids: null }],
    }
    f.answer('people', restricted)
    expect(f.reader.snapshot().views.people.data?.people).toEqual([])
    expect(f.reader.snapshot().views.people.data?.agents).toHaveLength(1)
    expect(f.reader.snapshot().views.people.data?.agents[0]?.presence[0]).toEqual({ project: 'garden', colour: 'grey', word: 'No recent signal' })
    expect(f.reader.snapshot().views.people.data?.narrowedByPermission?.[0]?.ids).toBeNull()
  })
  it('keeps an honest last-success receipt on transport failure and clears on access refusal', () => {
    const f = fixture(); f.all()
    const receipt = f.reader.snapshot().views.people.receivedAt
    f.reader.refresh()
    f.reader.receive({ interface: 'office-read/1', kind: 'refused', id: f.last('people').id, view: 'people', why: 'could-not-ask', said: 'Unavailable' })
    expect(f.reader.snapshot().views.people).toMatchObject({ data: people, status: 'stale', error: 'read', receivedAt: receipt })
    f.reader.refresh()
    f.reader.receive({ interface: 'office-read/1', kind: 'refused', id: f.last('people').id, view: 'people', why: 'not-in-the-manifest', said: 'Refused' })
    expect(f.reader.snapshot().views.people.data).toBeNull()
  })
})

describe('baseline contacts and page lifecycle', () => {
  it('starts from latest, consumes incremental and withdrawal cursors, and stores no message history', () => {
    const f = fixture()
    const baseline = '2026-01-01 10:00:00~z'
    f.answer('talk', talk({ last: baseline, withdrawn: { ...talk().withdrawn, last: '20' } }))
    f.reader.refresh()
    expect(f.last('talk').query).toEqual({ after: baseline, withdrawnAfter: '20', limit: 20 })
    const metadata = talk({
      messages: [{ id: 'new', project: 'garden', at: '2026-01-01 10:00:01', from: { kind: 'agent', id: 'same' }, to: [{ kind: 'person', id: 'same' }] }],
      last: '2026-01-01 10:00:01~new', more: true,
      withdrawn: { ...talk().withdrawn, ids: ['old'], last: '21', more: true },
    })
    f.answer('talk', metadata)
    expect(f.reader.snapshot().views.talk.data?.messages).toEqual([])
    expect(f.reader.snapshot().views.talk.data?.withdrawn.ids).toEqual([])
    f.reader.refresh()
    expect(f.last('talk').query).toEqual({ after: metadata.last, withdrawnAfter: '21', limit: 20 })
    f.answer('talk', talk({ last: metadata.last, withdrawn: { ...talk().withdrawn, last: '21' } }))
    expect(f.reader.snapshot().views.talk.data?.last).toBe(metadata.last)
  })
  it('handles empty start, same-time IDs, arrivals during baseline and multiple manual pages without walks', () => {
    for (const baseline of [null, '2026-01-01 10:00:00~b']) {
      const f = fixture()
      f.answer('talk', talk({ last: baseline }))
      f.reader.refresh()
      expect(f.last('talk').query).not.toHaveProperty('start')
      for (const id of ['a', 'b', 'c']) {
        const message = { id, project: 'garden', at: '2026-01-01 10:00:00', from: { kind: 'person' as const, id: 'same' }, to: [{ kind: 'agent' as const, id: 'same' }] }
        f.answer('talk', talk({ messages: [message], last: `${message.at}~${id}`, more: true }))
        expect(f.reader.snapshot().views.talk.data?.messages).toEqual([])
        f.reader.refresh()
      }
    }
  })
  it('records limited talk visibility, rejects malformed cursors and never loops on an unchanged cursor', () => {
    const f = fixture()
    f.answer('talk', talk({ refusal: 'Only permitted contacts' }))
    expect(f.reader.snapshot().views.talk.data?.refusal).toBe('Only permitted contacts')
    f.reader.refresh(); f.answer('talk', talk({ last: 'malformed' }))
    expect(f.reader.snapshot().views.talk.error).toBe('invalid')
    f.reader.refresh(); expect(f.last('talk').query).toEqual({ start: 'latest' })
    const count = f.sent.length
    f.answer('talk', talk({ more: true }))
    expect(f.sent).toHaveLength(count)
  })
  it('pausing or hiding clears reads; resume and reopening use a new silent baseline', () => {
    const f = fixture(); f.all()
    f.reader.setActive(false)
    expect(f.reader.snapshot().views.people.data).toBeNull()
    const count = f.sent.length; f.reader.refresh(); expect(f.sent).toHaveLength(count)
    f.reader.setActive(true)
    expect(f.last('talk').query).toEqual({ start: 'latest' })
    f.reader.dispose()
    const again = fixture()
    expect(again.last('talk').query).toEqual({ start: 'latest' })
  })
  it('dispose releases data and ignores late replies, refreshes and repeated ready calls', () => {
    const f = fixture(); f.all(); f.reader.refresh()
    f.reader.dispose()
    const count = f.sent.length
    f.answer('people', people); f.reader.refresh(); f.reader.start(); f.reader.receive(context); f.reader.dispose()
    expect(f.sent).toHaveLength(count)
    expect(f.reader.snapshot().context).toBeNull()
    for (const state of Object.values(f.reader.snapshot().views)) expect(state.data).toBeNull()
  })
  it('the mount accepts only parent messages and removes every listener on page close', () => {
    class FakeTarget {
      listeners = new Map<string, Set<(event: unknown) => void>>()
      addEventListener(type: string, callback: (event: unknown) => void) { const listeners = this.listeners.get(type) ?? new Set(); listeners.add(callback); this.listeners.set(type, listeners) }
      removeEventListener(type: string, callback: (event: unknown) => void) { this.listeners.get(type)?.delete(callback) }
      emit(type: string, event: unknown = {}) { for (const callback of [...this.listeners.get(type) ?? []]) callback(event) }
      count() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0) }
    }
    const window = new FakeTarget()
    const document = Object.assign(new FakeTarget(), { hidden: false })
    const sent: PluginAsksTheSlot[] = []
    const parent = { postMessage: (message: PluginAsksTheSlot, origin: string) => { expect(origin).toBe('*'); sent.push(message) } }
    const target = Object.assign(window, { parent })
    const { reader, dispose } = mountReader(target as unknown as Window, document as unknown as Document, () => {})
    window.emit('message', { source: {}, data: context })
    expect(reader.snapshot().context).toBeNull()
    window.emit('message', { source: parent, data: context })
    expect(reader.snapshot().context?.project).toBe('garden')
    document.hidden = true; document.emit('visibilitychange')
    expect(reader.snapshot().active).toBe(false)
    window.emit('pagehide'); dispose()
    expect(window.count()).toBe(0); expect(document.count()).toBe(0)
    expect(reader.snapshot().context).toBeNull()
  })
  it('ignores a populated initial snapshot and exposes only new projected metadata once', () => {
    const f = fixture(), message = { id: 'first', project: 'garden', at: '2026-01-01 10:00:00', from: { kind: 'agent', id: 'same' }, to: [{ kind: 'agent', id: 'oak' }], text: 'never keep these words' }
    f.answer('talk', talk({ messages: [message as never], last: `${message.at}~first` }))
    expect(f.reader.snapshot().contacts?.messages).toEqual([])
    f.reader.refresh()
    f.answer('talk', talk({ messages: [{ ...message, id: 'second' } as never], last: `${message.at}~second` }))
    const batch = f.reader.snapshot().contacts!
    expect(batch.messages).toHaveLength(1); expect(batch.messages[0]?.id).toBe('second')
    expect(JSON.stringify(f.reader.snapshot())).not.toContain('never keep these words')
    f.reader.refresh(); f.answer('talk', null, 304)
    expect(f.reader.snapshot().contacts?.sequence).toBe(batch.sequence)
    expect(f.sent.every(one => one.ask === 'ready' || one.ask === 'read')).toBe(true)
  })
  it('bounds new contact batches even if the bridge ignores the requested limit', () => {
    const f = fixture(); f.all(); f.reader.refresh()
    f.answer('talk', talk({ messages: Array.from({ length: 1000 }, (_, i) => ({ id: String(i), project: 'garden', at: '2026-01-01 10:00:00', from: { kind: 'agent', id: 'same' }, to: [{ kind: 'agent', id: 'oak' }] })) }))
    expect(f.reader.snapshot().contacts?.messages).toHaveLength(20)
    expect(f.reader.snapshot().views.talk.data?.messages).toEqual([])
  })
  it('does not repeat a denied view until a new context, including pause and late answers', () => {
    const f = fixture(); f.all(); f.reader.refresh(); f.answer('people', {}, 403)
    const asks = f.asks('people').length
    for (let i = 0; i < 40; i++) f.reader.refresh()
    f.reader.setActive(false); f.reader.setActive(true)
    expect(f.asks('people')).toHaveLength(asks)
    f.reader.receive({ ...context, theme: 'dark' })
    expect(f.asks('people')).toHaveLength(asks + 1)
  })
  it('leaves slow views single-flight while the other views finish and remain usable', () => {
    const f = fixture(); f.answer('people', people); f.answer('work', work)
    for (let i = 0; i < 100; i++) f.reader.refresh()
    expect(f.asks('projects')).toHaveLength(1); expect(f.asks('talk')).toHaveLength(1)
    expect(f.reader.snapshot().views.people.data).toEqual(people)
    expect(f.reader.snapshot().views.work.data).toEqual(work)
    f.reader.setActive(false); f.reader.setActive(true); f.reader.refresh()
    expect(f.asks('projects')).toHaveLength(1)
    f.answer('projects', projects)
    expect(f.reader.snapshot().views.projects.data).toBeNull()
    expect(f.asks('projects')).toHaveLength(2)
  })
  it('quiet and offscreen return discard an outstanding increment and request a fresh baseline', () => {
    const f = fixture(); f.all(); f.reader.refresh(); const before = f.last('talk')
    f.reader.resetTalk(); f.reader.refresh()
    expect(f.last('talk').id).toBe(before.id)
    f.answer('talk', talk({ messages: [{ id: 'while-away', project: 'garden', at: '2026-01-01 10:00:00', from: { kind: 'agent', id: 'same' }, to: [{ kind: 'agent', id: 'oak' }] }] }))
    expect(f.reader.snapshot().contacts).toBeNull()
    expect(f.last('talk').query).toEqual({ start: 'latest' })
    f.answer('talk', talk()); expect(f.reader.snapshot().contacts?.messages).toEqual([])
  })
  it('never animates a page whose withdrawal list is incomplete', () => {
    const f = fixture(); f.all(); f.reader.refresh()
    f.answer('talk', talk({ withdrawn: { ...talk().withdrawn, more: true } }))
    expect(f.reader.snapshot().contacts?.messages).toEqual([])
    f.reader.refresh(); expect(f.last('talk').query).not.toHaveProperty('start')
  })
  it('rejects an over-budget withdrawal list rather than losing a withdrawal for a live gesture', () => {
    const f = fixture(); f.all(); f.reader.refresh()
    f.answer('talk', talk({ withdrawn: { ...talk().withdrawn, ids: Array.from({ length: 1001 }, (_, i) => String(i)) } }))
    expect(f.reader.snapshot().views.talk.error).toBe('invalid'); expect(f.reader.snapshot().contacts).toBeNull()
  })
})
