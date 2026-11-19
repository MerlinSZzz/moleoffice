// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it, vi } from 'vitest'
import { OfficeReader } from '../src/bridge.ts'
import { chunks } from '../src/screen-facts.ts'
import type { PluginAsksTheSlot } from '../src/contracts.ts'
import { context, talk } from './fixtures.ts'

type Ask = Extract<PluginAsksTheSlot, { ask: 'read' }>
function setup() {
  const sent: Ask[] = []
  const reader = new OfficeReader(m => { if (m.ask === 'read') sent.push(m) }, () => {})
  const asks = () => sent.filter(m => m.view === 'talk')
  const answer = (ask = asks().at(-1)!, body = talk({ last: '2026-01-01 12:00:00~generated-1' })) => reader.receive({ interface: 'office-read/1', kind: 'answer', id: ask.id, view: 'talk', status: 200, tag: 'private', body })
  reader.receive(context)
  return { reader, sent, asks, answer }
}
describe('reads follow explicit demand', () => {
  it('cancels a partially decoded talk answer on close without replay or re-read', () => {
    const turns: (() => void)[] = []
    vi.stubGlobal('MessageChannel', class {
      port1 = { onmessage: null as (() => void) | null, close() {} }
      port2 = { postMessage: () => turns.push(() => this.port1.onmessage?.()), close() {} }
    })
    try {
      const f = setup(); f.reader.setTalkOpen(true); const ask = f.asks()[0]!
      f.reader.receive({ interface: 'office-read/1', kind: 'answer', id: ask.id, view: 'talk', status: 200, tag: 'private', body: talk() }, true)
      expect(f.reader).toMatchObject({ decoding: new Map([['talk', expect.anything()]]) })
      f.reader.setTalkOpen(false)
      while (turns.length) turns.shift()!()
      f.reader.refresh(); expect(f.asks()).toHaveLength(1)
      expect(f.reader.snapshot().contacts).toBeNull(); expect(f.reader.snapshot().views.talk.data).toBeNull()
      f.reader.setTalkOpen(true); expect(f.asks()).toHaveLength(2)
    } finally { vi.unstubAllGlobals() }
  })
  it('keeps people and work chunks at 20 with exact order and coverage', () => {
    const ids = Array.from({ length: 168 }, (_, i) => `generated-${i}`)
    expect(chunks(ids).map(part => part.length)).toEqual([20,20,20,20,20,20,20,20,8])
    expect(chunks(ids).flat()).toEqual(ids)
  })
  it('starts and refreshes with talk closed; open establishes baseline and close clears private state', () => {
    const f = setup(); f.reader.refresh()
    expect(f.asks()).toEqual([])
    f.reader.setTalkOpen(true); expect(f.asks()).toHaveLength(1)
    expect(f.asks()[0]!.query).toEqual({ start: 'latest' })
    f.answer(); expect(f.reader.snapshot().contacts?.messages).toEqual([])
    f.reader.refresh(); expect(f.asks().at(-1)?.query).toEqual({ limit: 20, after: '2026-01-01 12:00:00~generated-1', withdrawnAfter: '0' })
    f.answer(); f.reader.setTalkOpen(false)
    expect(f.reader.snapshot().contacts).toBeNull(); expect(f.reader.snapshot().views.talk.data).toBeNull()
    const before = f.asks().length; f.reader.refresh(); expect(f.asks()).toHaveLength(before)
    f.reader.setTalkOpen(true); expect(f.asks().at(-1)?.query).toEqual({ start: 'latest' })
    expect(f.asks().at(-1)).not.toHaveProperty('tag')
  })
  it('ignores stale pending answers on close and on close/reopen while preserving single flight', () => {
    const f = setup(); f.reader.setTalkOpen(true); const pending = f.asks().at(-1)!
    f.reader.setTalkOpen(false); f.answer(pending); f.reader.refresh()
    expect(f.asks()).toHaveLength(1); expect(f.reader.snapshot().views.talk.data).toBeNull()
    f.reader.setTalkOpen(true); const second = f.asks().at(-1)!
    f.reader.setTalkOpen(false); f.reader.setTalkOpen(true)
    expect(f.asks()).toHaveLength(2)
    f.answer(second); expect(f.asks()).toHaveLength(3)
    expect(f.asks().at(-1)?.query).toEqual({ start: 'latest' })
    expect(f.reader.snapshot().contacts).toBeNull()
    f.answer(); f.reader.setTalkOpen(false)
    const before = f.asks().length; f.answer(second); expect(f.asks()).toHaveLength(before)
  })
  it('retains open demand across pause/context, blocks closed talk on stale-generation replies and respects denial', () => {
    const f = setup(); f.reader.setTalkOpen(true); const old = f.asks().at(-1)!
    f.reader.setActive(false); f.reader.setTalkOpen(false); f.reader.setActive(true); f.answer(old)
    expect(f.asks()).toHaveLength(1)
    f.reader.setTalkOpen(true); f.answer(); f.reader.setActive(false); const before = f.asks().length
    f.reader.refresh(); expect(f.asks()).toHaveLength(before)
    f.reader.setActive(true); expect(f.asks().at(-1)?.query).toEqual({ start: 'latest' }); f.answer()
    f.reader.receive({ ...context, project: 'changed' }); expect(f.asks().at(-1)?.query).toEqual({ start: 'latest' })
    const denied = f.asks().at(-1)!
    f.reader.receive({ interface: 'office-read/1', kind: 'answer', id: denied.id, view: 'talk', status: 403, tag: null, body: null })
    const n = f.asks().length; f.reader.setTalkOpen(false); f.reader.setTalkOpen(true); f.reader.refresh(); expect(f.asks()).toHaveLength(n)
    f.reader.receive({ ...context, project: 'permitted-again' }); expect(f.asks()).toHaveLength(n + 1)
  })
})
