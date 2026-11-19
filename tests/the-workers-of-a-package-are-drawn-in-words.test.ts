// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PACKAGE'S WORKERS ARE DRAWN AS A LIST A PERSON READS. Round FQ, point OP-3.
 *
 * src/web/components/PackageWorkers.tsx draws the server's reading (`theWorkersOfAPackage` in
 * src/server/lib/package-workers.ts): each worker with its name and handle, the ask's state, its run, the model, the
 * points, the difficulty and why, its tokens, its minutes and how many hand-backs name its run.
 *
 * What is held:
 *   1. A worker with a run opens that run, and its numbers are drawn as measured: tokens as input, output and total, and
 *      minutes as a count. A hand-back sentence is drawn beside the count.
 *   2. A worker with no receipt is never drawn as zero tokens, and a running worker's minutes are not a count.
 *   3. An ask whose worker's run was never filed is drawn with its ask's state and why its numbers are absent.
 *
 * Mutations, one at a time, restored with cp and checked with cmp:
 *   A. a missing receipt is drawn as zero tokens: case 2 goes red.
 *   B. a running run is drawn with null minutes as 0 minutes: case 2 goes red.
 *   C. an ask with no run is dropped from the list: case 3 goes red.
 *   D. the run's title is drawn without its link: case 1 goes red.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

import type { AWorkerOfAPackage, TheWorkersOfAPackage } from '../src/shared/package-workers.ts'

type Shown = typeof import('../src/web/components/PackageWorkers.tsx')
let shown: Shown
let runPage: (id: string) => string

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  ;(globalThis as unknown as { window: unknown }).window ??= {
    localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {}, removeEventListener: () => {},
  }
  shown = await import('../src/web/components/PackageWorkers.tsx')
  const { recordPath } = await import('../src/web/components/router.tsx')
  runPage = (id) => `href="#${recordPath(id, 'session')}"`
})

const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const measured: AWorkerOfAPackage = {
  agent: 'acct-id', name: 'Ann, a made-up builder', handle: 'xp-accounted', asked: 'started', state: 'finished',
  askedAt: '2026-11-17 10:00:00', askedOn: { run: 'sup-run', title: 'A made-up supervisor run' },
  runId: 'run-accounted', runTitle: 'A made-up worker run of xp-accounted', model: 'claude-opus-5-5',
  points: ['xp-point-1', 'xp-point-2'], difficulty: 'simple', why: 'These two points belong to this worker.',
  tokens: { input: 1000, output: 500, total: 1500, read: true, notRead: null },
  minutes: { startedAt: '2026-11-17 10:00:00', endedAt: '2026-11-17 10:30:00', minutes: 30, running: false, notCounted: null },
  wentBack: 1, wentBackSays: 'One hand-back on the package names this worker’s run.',
}

const noReceipt: AWorkerOfAPackage = {
  ...measured, agent: 'nr-id', name: 'Noa, a made-up builder', handle: 'xp-noreceipt',
  runId: 'run-noreceipt', runTitle: 'A made-up worker run of xp-noreceipt', model: 'deepseek-v4',
  tokens: { input: null, output: null, total: null, read: false, notRead: "The run's record has no usage receipt, so its tokens were not read." },
  minutes: { startedAt: '2026-11-17 10:00:00', endedAt: null, minutes: null, running: true, notCounted: 'The run is still going, so its minutes are not complete and are not counted.' },
  wentBack: 0, wentBackSays: 'No hand-back names this worker’s run.',
}

const unfiled: AWorkerOfAPackage = {
  ...measured, agent: 'nf-id', name: null, handle: 'xp-nofiling', asked: 'wanted', state: null,
  askedOn: null, runId: null, runTitle: null, model: null,
  tokens: { input: null, output: null, total: null, read: false, notRead: 'No run was filed for this ask, so its tokens were not read.' },
  minutes: { startedAt: null, endedAt: null, minutes: null, running: false, notCounted: 'No run was filed for this ask, so its minutes were not counted.' },
  wentBack: 0, wentBackSays: 'No hand-back names a run of this ask, which has none yet.',
}

const READING: TheWorkersOfAPackage = {
  task: 'task-id', title: 'A made-up packaged task', pointIds: ['xp-point-1', 'xp-point-2'],
  workers: [measured, noReceipt, unfiled],
  handbacks: { total: 2, byWorkers: 1, notNamingAWorker: 1 },
  says: 'Tokens are the run’s own usage receipt, added by the office’s one summation.',
}

function rowOf(html: string, handle: string): string {
  const rows = html.split('<li').slice(1)
  const row = rows.find((one) => one.includes(handle))
  expect(row, `no row for ${handle}`).toBeDefined()
  return row!
}

describe('a package’s workers are drawn in words', () => {
  it('1: a worker with a run opens it and its measured tokens and minutes are drawn', () => {
    const html = renderToStaticMarkup(h(shown.TheWorkersOfAPackagePanel, { reading: READING }))
    expect(words(html)).toContain('Every worker this package was given to')
    const row = rowOf(html, 'xp-accounted')
    expect(row).toContain(runPage('run-accounted'))
    expect(row).toContain('>Ann, a made-up builder</a>')
    expect(words(row)).toContain('claude-opus-5-5')
    expect(words(row)).toContain('xp-point-1, xp-point-2')
    expect(words(row)).toContain('simple')
    expect(words(row)).toContain('These two points belong to this worker.')
    expect(words(row)).toContain('1500 in all (1000 in, 500 out)')
    expect(words(row)).toContain('30 minutes')
    expect(words(row)).toContain('One hand-back on the package names this worker’s run.')
    expect(words(html)).toContain('Hand-backs: 2 in all, 1 naming a worker and 1 naming none.')
  })

  it('2: no receipt is never zero tokens, and a running worker’s minutes are not a count', () => {
    const html = renderToStaticMarkup(h(shown.TheWorkersOfAPackagePanel, { reading: READING }))
    const row = rowOf(html, 'xp-noreceipt')
    expect(words(row)).toContain('not read')
    expect(words(row)).toContain('no usage receipt')
    expect(words(row), 'a missing receipt is drawn as a zero').not.toContain('0 in all')
    expect(words(row)).toContain('still running')
    expect(words(row), 'a running run is drawn with a minute count').not.toMatch(/\d+ minutes/)
  })

  it('4: the difficulty is drawn as the supervisor wrote it, including a word the page has no list for', () => {
    const odd: AWorkerOfAPackage = { ...measured, agent: 'odd-id', handle: 'xp-odd', difficulty: 'middling' }
    const html = renderToStaticMarkup(h(shown.TheWorkersOfAPackagePanel, { reading: { ...READING, workers: [odd] } }))
    const row = rowOf(html, 'xp-odd')
    expect(words(row)).toContain('middling')
    expect(words(row), 'a difficulty with no entry in the page’s own list was drawn as absent').not.toContain('not recorded')
  })

  it('3: an ask whose run was never filed is drawn with its own state and why its numbers are absent', () => {
    const html = renderToStaticMarkup(h(shown.TheWorkersOfAPackagePanel, { reading: READING }))
    const row = rowOf(html, 'xp-nofiling')
    expect(row).not.toContain('href=')
    expect(words(row)).toContain('wanted')
    expect(words(row)).toContain('no run filed')
    expect(words(row)).toContain('No run was filed for this ask')
    expect(words(row)).toContain('The ask is not on a supervisor run the office can read.')
  })
})
