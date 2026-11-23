// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'

type Shown = typeof import('../src/web/components/TheStopAndWaitOfARun.tsx')
type Mode = typeof import('../src/web/lib/mode.ts')
let shown: Shown
let mode: Mode
let drawnTime: (instant: string) => string

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  ;(globalThis as unknown as { window: unknown }).window ??= {
    localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {}, removeEventListener: () => {},
  }
  shown = await import('../src/web/components/TheStopAndWaitOfARun.tsx')
  mode = await import('../src/web/lib/mode.ts')
  const time = await import('../src/shared/time.ts')
  drawnTime = (instant) => time.drawnStamp(time.localStamp(new Date(instant)))
  mode.setMode('normal')
})
afterAll(() => {
  mode.setMode('normal')
})

/** The state line a panel draws above its facts, as the markup holds it. */
const stateLine = (key: 'w13s.stop.sessionLimitWord' | 'w13s.stop.quotaWord' | 'w13s.stop.loginWord' | 'w13s.wait.waitingWord' | 'w13s.wait.notGoingWord') =>
  `<p class="sw-state">${enWave13y[key]}</p>`

/** The drawn text, with the style sheet and the tags taken out and the quotes put back. */
function textOf(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

const stopOf = (data: Record<string, unknown>) => renderToStaticMarkup(h(shown.TheStopOfARun, { data }))
const waitOf = (data: Record<string, unknown>) => renderToStaticMarkup(h(shown.TheWaitOfARun, { data }))

const A_GO_STOP = {
  kind: 'quota',
  said: 'Made-up: Go usage limit reached. It will reset in 2 hours.',
  at: '2026-10-14T08:40:00.000+01:00',
  resetsAt: '2026-10-14T10:40:00.000+01:00',
  resetFrom: 'named by the error, as OpenCode\'s retry read it: "It will reset in 2 hours"',
}

const A_GO_WAIT = {
  provider: 'opencode-go',
  said: 'Made-up: Go usage limit reached. It will reset in 2 hours.',
  attempt: 3,
  seenAt: '2026-10-14T09:12:00.000+01:00',
  resetsAt: '2026-10-14T11:12:00.000+01:00',
  resetFrom: "assumed: five hours, Go's allowance window (OpenCode's retry named no reset)",
}

describe("a run's stop and its wait on a limit, on the run's page", () => {
  it('1. a stop is drawn at alarm rank with its cause, its words, its time and its reset', () => {
    const html = stopOf({ state: 'crashed', stopCause: A_GO_STOP })
    expect(html).toContain('data-rank="0"')
    expect(html).toContain(stateLine('w13s.stop.quotaWord'))
    const text = textOf(html)
    expect(text).toContain('Why it stopped')
    expect(text).toContain('“Made-up: Go usage limit reached. It will reset in 2 hours.”')
    expect(text).toContain(`When ${drawnTime(A_GO_STOP.at)}`)
    expect(text).toContain(`Resets ${drawnTime(A_GO_STOP.resetsAt)} Reset time named by the error, as OpenCode's retry read it: "It will reset in 2 hours".`)

    expect(stopOf({ stopCause: { ...A_GO_STOP, kind: 'session-limit' } })).toContain(stateLine('w13s.stop.sessionLimitWord'))
    expect(stopOf({ stopCause: { ...A_GO_STOP, kind: 'login' } })).toContain(stateLine('w13s.stop.loginWord'))
    expect(stopOf({ stopCause: { ...A_GO_STOP, kind: 'made-up-cause' } })).toContain(
      `<p class="sw-state">${enWave13y['w13s.stop.otherWord'].replace('{kind}', 'made-up-cause')}</p>`,
    )
  })

  it('2. a reset in words is drawn as written, and a stop with no time and no reset says so', () => {
    const inWords = textOf(stopOf({ stopCause: { kind: 'session-limit', said: "Made-up: You've hit your session limit · resets 7:10pm (Europe/London)", at: null, resetsAt: '7:10pm (Europe/London)' } }))
    expect(inWords).toContain('Resets 7:10pm (Europe/London)')
    expect(inWords).toContain('When Nobody recorded when.')
    expect(inWords).not.toContain('Reset time')

    const none = textOf(stopOf({ stopCause: { kind: 'login', said: 'Made-up: Please run /login.', at: null, resetsAt: null } }))
    expect(none).toContain('Resets It named no reset time.')
  })

  it('3. a wait is drawn plainly with its words, when it was seen, its reset, the attempt and whose limit it is', () => {
    const html = waitOf({ state: 'running', waitingOnALimit: A_GO_WAIT })
    expect(html).toContain('data-rank="1"')
    expect(html).toContain(stateLine('w13s.wait.waitingWord'))
    const text = textOf(html)
    expect(text).toContain('Waiting on a usage limit')
    expect(text).toContain('“Made-up: Go usage limit reached. It will reset in 2 hours.”')
    expect(text).toContain(`Seen ${drawnTime(A_GO_WAIT.seenAt)}`)
    expect(text).toContain(`Resets ${drawnTime(A_GO_WAIT.resetsAt)} Reset time assumed: five hours, Go's allowance window (OpenCode's retry named no reset).`)
    expect(text).toContain('Attempt 3')
    expect(text).toContain('Whose limit opencode-go')
  })

  it('4. a run that is not running is not said to be waiting', () => {
    for (const state of ['finished', 'crashed', 'unknown', undefined]) {
      const html = waitOf({ state, waitingOnALimit: A_GO_WAIT })
      expect(html, String(state)).toContain(stateLine('w13s.wait.notGoingWord'))
      expect(html, String(state)).not.toContain(stateLine('w13s.wait.waitingWord'))
    }
    expect(waitOf({ state: 'idle', waitingOnALimit: A_GO_WAIT })).toContain(stateLine('w13s.wait.waitingWord'))
  })

  it('5. a run that keeps either in extra, as older runs do, is drawn too', () => {
    expect(stopOf({ state: 'crashed', extra: { stopCause: A_GO_STOP } })).toContain(stateLine('w13s.stop.quotaWord'))
    expect(waitOf({ state: 'running', extra: { waitingOnALimit: A_GO_WAIT } })).toContain(stateLine('w13s.wait.waitingWord'))
  })

  it('6. a run that holds neither draws nothing', () => {
    expect(stopOf({ state: 'finished', detail: 'Made-up: finished cleanly.' })).toBe('')
    expect(waitOf({ state: 'running' })).toBe('')
  })
})
