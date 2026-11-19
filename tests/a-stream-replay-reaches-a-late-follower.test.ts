// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A replay can precede subscription restoration; its payload must still reach the late follower. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChannelEvent } from '../src/shared/events.ts'
import type { HoldTheStream } from '../src/web/lib/onestream.ts'

vi.mock('../src/web/lib/ready.ts', () => ({ aRequestStarted: vi.fn(), aRequestSettled: vi.fn() }))

class TabChannel {
  static all: TabChannel[] = []
  static sent: { channel: string; data: Record<string, unknown> }[] = []
  onmessage: ((message: { data: unknown }) => void) | null = null

  constructor(readonly name: string) { TabChannel.all.push(this) }
  postMessage(data: Record<string, unknown>): void { TabChannel.sent.push({ channel: this.name, data }) }
  close(): void {}
}

const changed: ChannelEvent = { name: 'list.changed', workspaceId: null, lists: [], about: null, groupId: null, because: 'A made-up list changed.' }
const other: ChannelEvent = { name: 'presence.changed', who: { kind: 'agent', id: 'reader' }, colour: 'green' }
const aRecord: ChannelEvent = { name: 'record.changed', workspaceId: 'default', recordId: 'made-up-record', kind: 'report', what: 'revision' }
let leave: (() => void) | undefined

beforeEach(() => {
  vi.resetModules()
  TabChannel.all = []
  TabChannel.sent = []
  vi.stubGlobal('BroadcastChannel', TabChannel)
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('navigator', { locks: { request: (_key: string, held: () => Promise<void>) => held() } })
})

afterEach(() => {
  leave?.()
  leave = undefined
  vi.unstubAllGlobals()
})

async function aReplacement() {
  const { joinTheStream } = await import('../src/web/lib/onestream.ts')
  let stream!: Parameters<HoldTheStream>[0]
  const joined = joinTheStream('replacement', (options) => {
    stream = options
    options.onState({ open: true, says: null })
    options.onRun('run', 0, 0)
  }, {
    event: vi.fn(), state: vi.fn(), lost: vi.fn(), missedWhileConnecting: vi.fn(),
  }, () => new Set(), () => {}, async () => false)
  leave = joined.leave
  const shared = TabChannel.all[0] as TabChannel
  const say = (data: Record<string, unknown>) => shared.onmessage?.({ data })
  const events = () => TabChannel.sent.filter((one) => one.channel.endsWith('|follower') && one.data.type === 'event').map((one) => one.data)
  return { stream, joined, say, events }
}

describe('a replacement stream whose replay precedes a follower subscription', () => {
  it.each(['hello', 'wants'])('hands the retained matching replay in order when %s arrives first', async (type) => {
    const { stream, say, events } = await aReplacement()
    stream.onEvent(1, changed)
    stream.onEvent(2, other)
    stream.onEvent(3, changed)
    expect(events()).toEqual([])
    expect(TabChannel.sent.filter((one) => one.data.type === 'tick').map((one) => one.data.id)).toEqual([1, 2, 3])

    const follower = { tab: 'follower', wants: [changed.name], pageStart: 0, listening: true }
    say({ type, ...follower })
    stream.onEvent(4, changed)
    say({ type: 'hello', ...follower })
    expect(events()).toEqual([
      { type: 'event', id: 1, event: changed },
      { type: 'event', id: 3, event: changed },
      { type: 'event', id: 4, event: changed },
    ])
  })

  it('reconciles a first-page read instead of replaying history into a new page', async () => {
    const { stream, say, events } = await aReplacement()
    stream.onEvent(1, changed)
    say({ type: 'hello', tab: 'follower', wants: [changed.name], pageStart: 0, listening: false })
    expect(events()).toEqual([])
    expect(TabChannel.sent.filter((one) => one.channel.endsWith('|follower')).map((one) => one.data)).toEqual([
      { type: 'listening', missed: true },
    ])
  })

  it('tells a first-page read that only record changes arrived for it, so only what follows records reads again', async () => {
    // Wave 13y round 146. A change to a record is read again only by what follows it, so a tab that missed nothing
    // else is told so, and its lists are not read again.
    const { stream, say } = await aReplacement()
    stream.onEvent(1, aRecord)
    stream.onEvent(2, other)
    say({ type: 'hello', tab: 'follower', wants: [changed.name, aRecord.name], pageStart: 0, listening: false })
    await expect.poll(() => TabChannel.sent.filter((one) => one.channel.endsWith('|follower')).map((one) => one.data)).toEqual([
      { type: 'listening', missed: 'record changes' },
    ])
  })

  it('keeps only the new server run when the server restarts before a late hello', async () => {
    const { stream, say, events } = await aReplacement()
    stream.onEvent(1, other)
    stream.onRun('replacement-run', 0, 0)
    stream.onEvent(1, changed)
    say({ type: 'hello', tab: 'follower', wants: [other.name, changed.name], pageStart: 0, listening: true })
    expect(events()).toEqual([{ type: 'event', id: 1, event: changed }])
  })

  it.each(['hello', 'wants'])('reconciles a late follower after the retained history fills, with %s first', async (type) => {
    const { stream, say } = await aReplacement()
    const { ARRIVALS_KEPT, joinTheStream } = await import('../src/web/lib/onestream.ts')
    for (let id = 1; id <= ARRIVALS_KEPT + 1; id += 1) stream.onEvent(id, changed)

    const leaveHolder = leave
    const lost = vi.fn()
    const event = vi.fn()
    vi.stubGlobal('navigator', { locks: { request: () => new Promise(() => {}) } })
    const follower = joinTheStream('replacement', () => {}, {
      event, state: vi.fn(), lost, missedWhileConnecting: vi.fn(),
    }, () => new Set([changed.name]), () => {}, async () => false)
    leave = () => { follower.leave(); leaveHolder?.() }
    if (type === 'wants') follower.wantsChanged()
    const subscription = TabChannel.sent.filter((one) => one.channel === 'mole-office-stream|replacement' && one.data.type === type).at(-1)
    expect(subscription).toBeDefined()
    say(subscription!.data)

    const privateName = `mole-office-stream|replacement|${String(subscription!.data.tab)}`
    const deliveries = TabChannel.sent.filter((one) => one.channel === privateName)
    expect(deliveries.map((one) => one.data.type), 'a truncated replay must reconcile instead of handing only its tail').toEqual(['lost'])
    const receiver = TabChannel.all.find((one) => one.name === privateName)
    expect(receiver).toBeDefined()
    for (const delivery of deliveries) receiver!.onmessage?.({ data: delivery.data })
    expect(lost, 'the private loss notice must reach the follower reconciliation callback').toHaveBeenCalledOnce()
    expect(event).not.toHaveBeenCalled()
    say({ ...subscription!.data, type: 'hello' })
    expect(TabChannel.sent.filter((one) => one.channel === privateName)).toHaveLength(deliveries.length)
  })

  it('identifies whether a wants update is from an already listening tab', async () => {
    await aReplacement()
    // A queued tab can change what it draws while the replacement holder's hello is still pending.
    // Its subscription update must carry the same recovery information as its hello.
    // The holder above is used only to get this tab listening; a fresh join waits for the lock.
    leave?.()
    leave = undefined
    vi.stubGlobal('navigator', { locks: { request: () => new Promise(() => {}) } })
    const { joinTheStream } = await import('../src/web/lib/onestream.ts')
    const waiting = joinTheStream('waiting', () => {}, {
      event: vi.fn(), state: vi.fn(), lost: vi.fn(), missedWhileConnecting: vi.fn(),
    }, () => new Set([changed.name]), () => {}, async () => false)
    leave = waiting.leave
    waiting.wantsChanged()
    expect(TabChannel.sent.at(-1)?.data).toMatchObject({ listening: true, pageStart: expect.any(Number), wants: [changed.name] })
  })
})
