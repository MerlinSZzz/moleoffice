// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE READS THE COMMENTS AGAIN BY ITSELF ONLY AFTER THE LAST ANSWER, ONLY WHILE THE PAGE IS SHOWN AND DRAWS THEM,
 * AND AFTER LOST EVENTS AT MOST ONCE A MINUTE. Wave 13y round 18, guard (c).
 *
 * From 10:46 to 11:00 on 10 October 2026 the owner's review panel asked GET /api/messages/comments about every 40 s
 * while each answer took 32 to 48 s. `readAgainWhenAllowed` in src/web/components/agent/marks.ts is the only door an
 * event or lost events reach. These tests drive it with a clock that is not real and an answer that is held open, so
 * each one counts how many reads were asked for and when.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Marks = typeof import('../src/web/components/agent/marks.ts')
let marks: Marks
let asked = 0
let release: (() => void)[] = []
let hidden = false
let shown: (() => void) | null = null

const store = new Map<string, string>()
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  asked = 0
  release = []
  hidden = false
  shown = null
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  ;(globalThis as unknown as { document: unknown }).document = {
    get hidden() {
      return hidden
    },
    addEventListener: (name: string, ear: () => void) => {
      if (name === 'visibilitychange') shown = ear
    },
    removeEventListener: () => {},
  }
  vi.doMock('../src/web/api.ts', () => ({
    errorMessage: (err: unknown) => String(err),
    api: {
      agentMarks: () => Promise.resolve({ marks: [], goneOut: [] }),
      commentRecords: () => {
        asked += 1
        return new Promise((resolve) => release.push(() => resolve({ comments: [], recipientNames: {}, workspaceId: 'panelx' })))
      },
    },
  }))
  marks = await import('../src/web/components/agent/marks.ts')
})

afterEach(() => {
  vi.doUnmock('../src/web/api.ts')
  vi.useRealTimers()
  vi.resetModules()
  delete (globalThis as { document?: unknown }).document
})

/** Let the answer in flight come back, and let the promises after it run. */
async function answer(): Promise<void> {
  release.shift()?.()
  await vi.advanceTimersByTimeAsync(0)
}

describe('a read after lost events', () => {
  it('waits for the answer in flight, and asking twice while it waits is one read', async () => {
    marks.drawingMarks()
    marks.readAgainWhenAllowed('panelx:0', 'here')
    expect(asked).toBe(1)
    marks.readAgainWhenAllowed('panelx:0', 'lost')
    marks.readAgainWhenAllowed('panelx:0', 'lost')
    expect(asked, 'a second read started before the first answer came back').toBe(1)
    await answer()
    await vi.advanceTimersByTimeAsync(marks.READ_AGAIN_AT_MOST_EVERY_MS)
    expect(asked, 'the two events wanted one read, after the answer').toBe(2)
  })

  it('waits a minute after the last answer, however slow that answer was', async () => {
    marks.drawingMarks()
    marks.readAgainWhenAllowed('panelx:0', 'here')
    await vi.advanceTimersByTimeAsync(40_000)
    marks.readAgainWhenAllowed('panelx:0', 'lost')
    await answer()
    await vi.advanceTimersByTimeAsync(marks.READ_AGAIN_AT_MOST_EVERY_MS - 1)
    expect(asked, 'the next read came less than a minute after the answer').toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(asked).toBe(2)
  })

  it('waits while the page is hidden, and reads when it is shown again', async () => {
    marks.drawingMarks()
    marks.readAgainWhenAllowed('panelx:0', 'here')
    await answer()
    hidden = true
    marks.readAgainWhenAllowed('panelx:0', 'lost')
    await vi.advanceTimersByTimeAsync(10 * marks.READ_AGAIN_AT_MOST_EVERY_MS)
    expect(asked, 'a hidden page read the comments').toBe(1)
    hidden = false
    shown?.()
    expect(asked, 'the read that waited was dropped instead of asked when the page was shown').toBe(2)
  })

  it('waits while nothing on the page draws the marks', async () => {
    const stop = marks.drawingMarks()
    marks.readAgainWhenAllowed('panelx:0', 'here')
    await answer()
    stop()
    marks.readAgainWhenAllowed('panelx:0', 'lost')
    await vi.advanceTimersByTimeAsync(10 * marks.READ_AGAIN_AT_MOST_EVERY_MS)
    expect(asked, 'a page without the panel read the comments').toBe(1)
    marks.drawingMarks()
    expect(asked).toBe(2)
  })
})

describe('a read after a comment was placed', () => {
  it('waits for the answer in flight but not for the minute, so a comment appears without a reload', async () => {
    marks.drawingMarks()
    marks.readAgainWhenAllowed('panelx:0', 'here')
    marks.readAgainWhenAllowed('panelx:0', 'comment')
    expect(asked, 'a second read started before the first answer came back').toBe(1)
    await answer()
    expect(asked, 'a placed comment waited for the minute').toBe(2)
  })

  it('cuts short a wait for the minute that lost events started', async () => {
    marks.drawingMarks()
    marks.readAgainWhenAllowed('panelx:0', 'here')
    await answer()
    marks.readAgainWhenAllowed('panelx:0', 'lost')
    expect(asked).toBe(1)
    marks.readAgainWhenAllowed('panelx:0', 'comment')
    expect(asked, 'the comment waited behind the minute the lost events were waiting').toBe(2)
  })

  it('still waits while the page is hidden', async () => {
    marks.drawingMarks()
    marks.readAgainWhenAllowed('panelx:0', 'here')
    await answer()
    hidden = true
    marks.readAgainWhenAllowed('panelx:0', 'comment')
    expect(asked, 'a hidden page read the comments').toBe(1)
    hidden = false
    shown?.()
    expect(asked).toBe(2)
  })
})

describe('a read this browser caused', () => {
  it('does not wait for the minute, but still waits for the answer in flight', async () => {
    marks.drawingMarks()
    marks.readAgainWhenAllowed('panelx:0', 'here')
    marks.readAgainWhenAllowed('panelx:1', 'here')
    expect(asked, 'two reads were in flight at once').toBe(1)
    await answer()
    expect(asked, 'a change written here waited for the minute').toBe(2)
  })

  // ROUND 18B. Home draws marks in more than one place, and each asks for its key when it first draws. The merge
  // queue bounced round 18 on tests/home-asks-only-for-what-it-draws.test.ts: the load asked twice.
  it('is the read in flight when it asks for the key that read is for, so a first load asks once', async () => {
    marks.readAgainWhenAllowed('panelx:0', 'here')
    marks.drawingMarks()
    expect(asked).toBe(1)
    marks.readAgainWhenAllowed('panelx:0', 'here')
    marks.drawingMarks()
    await answer()
    await vi.advanceTimersByTimeAsync(10 * marks.READ_AGAIN_AT_MOST_EVERY_MS)
    expect(asked, 'the second thing on the page to draw marks asked again for the key already being read').toBe(1)
    marks.readAgainWhenAllowed('panelx:1', 'here')
    expect(asked, 'a change of page after the load did not read').toBe(2)
  })
})
