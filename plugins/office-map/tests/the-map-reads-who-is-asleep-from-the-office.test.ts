// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { PLUGIN_READ_INTERFACE } from '../../../src/shared/plugin-read.ts'
import { OfficeReader } from '../src/bridge.ts'
import type { PluginAsksTheSlot } from '../src/contracts.ts'
import { readView, readViewSlices } from '../src/read.ts'
import { asleepReading } from '../src/asleep-reading.ts'
import { words } from '../src/words.ts'
import manifest from '../plugin.json'
import { context } from './fixtures.ts'

// Every id here is made up.
const asleep = {
  interface: PLUGIN_READ_INTERFACE, view: 'asleep' as const, narrowedByPermission: null,
  agents: [{ id: 'invented-sleeper-a', since: '2026-08-02 08:00:00' }, { id: 'invented-sleeper-b', since: '2026-08-02 08:05:00' }],
}
const slices = (body: unknown) => { const work = readViewSlices('asleep', body); for (;;) { const next = work.next(); if (next.done) return next.value } }
type Read = Extract<PluginAsksTheSlot, { ask: 'read' }>

describe('the map reads who is asleep from the office', () => {
  it('declares the asleep view and asks for it with the light views, in both read modes', () => {
    expect(manifest.reads).toContain('asleep')
    for (const byScreen of [true, false]) {
      const sent: PluginAsksTheSlot[] = []
      const reader = new OfficeReader(message => sent.push(message), () => {}, () => 1, byScreen)
      reader.start(); reader.receive(context)
      const asked = () => sent.filter((one): one is Read => one.ask === 'read' && one.view === 'asleep')
      expect(asked(), `byScreen ${byScreen}`).toHaveLength(1)
      expect(asked()[0]!.query).toBeUndefined()
      reader.receive({ interface: PLUGIN_READ_INTERFACE, kind: 'answer', id: asked()[0]!.id, view: 'asleep', status: 200, tag: null, body: { ...asleep, extra: 'not published' } })
      expect(reader.snapshot().views.asleep).toMatchObject({ status: 'ready', error: null, data: asleep })
      reader.refresh()
      expect(asked()).toHaveLength(2)
    }
  })

  it('keeps only the published fields and refuses a malformed answer whole', () => {
    expect(readView('asleep', asleep)).toEqual(asleep)
    expect(slices(asleep)).toEqual(asleep)
    const extra = { ...asleep, agents: asleep.agents.map(one => ({ ...one, reason: 'not published' })) }
    expect(readView('asleep', extra)?.agents[0]).not.toHaveProperty('reason')
    for (const bad of [
      { ...asleep, view: 'online' },
      { ...asleep, agents: [{ id: '', since: '2026-08-02 08:00:00' }] },
      { ...asleep, agents: [{ id: 'invented-sleeper-a' }] },
      { ...asleep, agents: null },
    ]) {
      expect(readView('asleep', bad)).toBeNull()
      expect(slices(bad)).toBeNull()
    }
  })

  it('draws the read sleepers as real, a picture seam as made up, and nobody asleep when the read failed', () => {
    const ready = { data: asleep, error: null }
    expect(asleepReading(undefined, ready)).toEqual({ from: 'read', ids: new Set(['invented-sleeper-a', 'invented-sleeper-b']) })
    expect(asleepReading(undefined, { data: { ...asleep, agents: [] }, error: null })).toEqual({ from: 'read', ids: new Set() })
    expect(asleepReading(['invented-made-up'], ready)).toEqual({ from: 'picture', ids: new Set(['invented-made-up']) })
    expect(asleepReading(undefined, { data: null, error: null })).toEqual({ from: 'reading', ids: new Set() })
    // A failed read may keep its last data; who is asleep now is still not known.
    expect(asleepReading(undefined, { data: asleep, error: 'read' })).toEqual({ from: 'unread', ids: new Set() })
    expect(asleepReading(undefined, undefined)).toEqual({ from: 'unread', ids: new Set() })
  })

  it('has words in both languages for a failed asleep read and a read sleeper, apart from the made-up sleep label', () => {
    for (const language of ['en', 'zh'] as const) {
      for (const key of ['asleepUnread', 'asleepPlate', 'asleepMadeUp', 'madeUpSleep'] as const) expect(words[language][key], `${language} ${key}`).toMatch(/\S/)
      expect(words[language].asleepPlate).not.toBe(words[language].madeUpSleep)
      expect(words[language].asleepUnread).not.toBe(words[language].asleepMadeUp)
    }
  })
})
