// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { LookFrames } from '../src/look-frames.ts'
import { Compositions } from '../src/action-resources.ts'

it('drops prepared and late sleep sources when no sleepers remain', async () => {
  const create = () => ({ width: 1, height: 1 }) as HTMLCanvasElement
  const standing = { palettes: [], recipes: [[0, 0]], sources: [{ sprite: 'stand-invented', anchor: [64, 110], mask: null, map: [] }] }
  const sleeping = { ...standing, sources: [{ ...standing.sources[0], sprite: 'sleep-invented' }] }
  const frame = (atlas: string) => ({ atlas, rect: [0, 0, 128, 128], trim: [0, 0], size: [128, 128], anchor: [64, 110] })
  const pack: any = { sources: { sprites: { 'stand-invented': frame('stand'), 'sleep-invented': frame('sleep') } }, images: new Map([['stand', {}], ['sleep', {}]]) }
  let finish!: (value: any) => void, started!: () => void
  const began = new Promise<void>(resolve => { started = resolve })
  const frames = new (LookFrames as any)(async () => ({ data: standing, masks: {} }), async () => new Uint8Array(), create, async () => new Uint8Array(128 * 128 * 4), new Compositions(create),
    async () => ({ data: sleeping, masks: {} }), () => { started(); return new Promise(resolve => { finish = resolve }) })
  expect(await frames.select(pack)).toBe(true)
  const baseline = frames.sourceBytes, pending = frames.prepareSleep(pack, [0]); await began
  let result: boolean | undefined
  try {
    expect(frames.clearSleep).toBeTypeOf('function')
    frames.clearSleep()
  } finally {
    finish({ width: 128, height: 128, channels: 4, data: new Uint8Array(128 * 128 * 4) })
    result = await pending
  }
  expect(result).toBe(false)
  expect(frames.sourceBytes).toBe(baseline)
  frames.release()
})

it('releases an already prepared sleeper while retaining standing sources', async () => {
  const create = () => ({ width: 1, height: 1 }) as HTMLCanvasElement
  const standing = { palettes: [], recipes: [[0, 0]], sources: [{ sprite: 'stand-invented', anchor: [64, 110], mask: null, map: [] }] }
  const sleeping = { ...standing, sources: [{ ...standing.sources[0], sprite: 'sleep-invented' }] }
  const frame = (atlas: string) => ({ atlas, rect: [0, 0, 128, 128], trim: [0, 0], size: [128, 128], anchor: [64, 110] })
  const pack: any = { sources: { sprites: { 'stand-invented': frame('stand'), 'sleep-invented': frame('sleep') } }, images: new Map([['stand', {}], ['sleep', {}]]) }
  const frames = new (LookFrames as any)(async () => ({ data: standing, masks: {} }), async () => new Uint8Array(), create, async () => new Uint8Array(128 * 128 * 4), new Compositions(create),
    async () => ({ data: sleeping, masks: {} }), async () => ({ width: 128, height: 128, channels: 4, data: new Uint8Array(128 * 128 * 4) }))
  expect(await frames.select(pack)).toBe(true)
  const baseline = frames.sourceBytes
  expect(await frames.prepareSleep(pack, [0])).toBe(true)
  expect(frames.sourceBytes).toBeGreaterThan(baseline)
  expect(frames.clearSleep).toBeTypeOf('function')
  frames.clearSleep()
  expect(frames.sourceBytes).toBe(baseline)
  frames.release()
})
