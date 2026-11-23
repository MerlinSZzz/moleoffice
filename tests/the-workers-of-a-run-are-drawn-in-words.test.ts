// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORKERS A SUPERVISOR'S RUN ASKED FOR ARE DRAWN AS A LIST A PERSON READS. Wave 13j round loop-4, item 0: Normal
 * mode drew nothing of a run's `workerRuns`. src/web/components/TheWorkersOfARun.tsx draws the server's reading of them
 * (`workers` on the record's answer, read in src/server/lib/worker-runs.ts): for each worker, who it is, the model, its
 * state, whether it sealed and its receipt's cost, with its name leading to its own run. Every record here is made up.
 *
 * What is held:
 *   1. Each worker is drawn in words: a name with a live run opens that run, and one without a live run is not a link;
 *      the run's own state and model; the model its launcher was given when there is no run yet; sealed or not; the cost
 *      on its receipt, no receipt, or a receipt with no cost; each state of an ask with no run; and the count of entries
 *      that did not read.
 *      A worker whose registered name is its handle is named once, not twice.
 *   2. A run that asked for no worker draws nothing, so the one mounting line costs other runs nothing.
 *
 * Mutations, one at a time, restored with cp and checked with cmp:
 *   G. the name is drawn without its link: case 1 goes red.
 *   H. a run is drawn as sealed whatever it says: case 1 goes red.
 *   I. a receipt with no cost is drawn as no receipt: case 1 goes red.
 *   J. a null reading draws the panel with no rows: case 2 goes red.
 *   K. the handle is drawn beside a name that is the same word: case 1 goes red.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { AWorkerARunAskedFor, TheWorkersARunStarted } from '../src/shared/worker-runs.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'

type Shown = typeof import('../src/web/components/TheWorkersOfARun.tsx')
type Mode = typeof import('../src/web/lib/mode.ts')
let shown: Shown
let mode: Mode
let stateWord: typeof import('../src/shared/words.ts').stateWord
let runPage: (id: string) => string

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  ;(globalThis as unknown as { window: unknown }).window ??= {
    localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {}, removeEventListener: () => {},
  }
  shown = await import('../src/web/components/TheWorkersOfARun.tsx')
  mode = await import('../src/web/lib/mode.ts')
  stateWord = (await import('../src/shared/words.ts')).stateWord
  const { recordPath } = await import('../src/web/components/router.tsx')
  runPage = (id) => `href="#${recordPath(id, 'session')}"`
  mode.setMode('normal')
})
afterAll(() => {
  mode.setMode('normal')
})

const ask = { failedSays: null, modelGiven: null, package: null, runId: null, run: null } satisfies Partial<AWorkerARunAskedFor>

const READING: TheWorkersARunStarted = {
  workers: [
    { ...ask, agent: 'ada-id', name: 'Ada, a made-up builder', handle: 'ws-ada', asked: 'started', modelGiven: 'claude-opus-5-5', runId: 'run-ada',
      run: { title: 'Made-up run: Ada builds the list', state: 'finished', model: 'claude-opus-5-5', sealed: true, receipt: { costUsd: 1.25 } } },
    { ...ask, agent: 'bo-id', name: 'Bo, a made-up builder', handle: 'ws-bo', asked: 'started', modelGiven: 'deepseek-v4', runId: 'run-bo',
      run: { title: 'Made-up run: Bo builds the page', state: 'running', model: 'deepseek-v4', sealed: false, receipt: null } },
    { ...ask, agent: 'cy-id', name: 'Cy, a made-up tester', handle: 'ws-cy', asked: 'started', modelGiven: 'luna-2', runId: 'run-cy',
      run: { title: 'Made-up run: Cy tests the page', state: 'finished', model: null, sealed: false, receipt: { costUsd: null } } },
    { ...ask, agent: 'di-id', name: 'Di, a made-up writer', handle: 'ws-di', asked: 'wanted' },
    { ...ask, agent: 'ed-id', name: 'Ed, a made-up builder', handle: 'ws-ed', asked: 'started', modelGiven: 'luna-2', runId: 'run-ed-gone' },
    { ...ask, agent: 'fy-id', name: 'Fy, a made-up builder', handle: 'ws-fy', asked: 'starting', modelGiven: 'luna-2' },
    { ...ask, agent: 'gone-id', name: null, handle: 'ws-gone', asked: 'failed', failedSays: 'The brief changed after it was asked for.' },
    { ...ask, agent: 'quiet-id', name: null, handle: 'ws-quiet', asked: 'failed' },
    { ...ask, agent: 'hy-id', name: 'ws-hy', handle: 'ws-hy', asked: 'wanted' },
  ],
  unreadable: 1,
}

/** The drawn text of one worker's row, found by its handle, with the tags taken out. */
function rowOf(html: string, handle: string): string {
  const rows = html.split('<li').slice(1)
  const row = rows.find((one) => one.includes(handle))
  expect(row, `no row for ${handle}`).toBeDefined()
  return row!
}
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe("the workers of a supervisor's run are drawn in words", () => {
  it('1: each worker is drawn with who it is, the model, its state, its seal and its cost, and its name opens its run', () => {
    const html = renderToStaticMarkup(h(shown.TheWorkersOfARun, { workers: READING }))
    expect(html, 'no line above the list says what it lists').not.toContain('wr-intro')

    const ada = rowOf(html, 'ws-ada')
    expect(ada).toContain(runPage('run-ada'))
    expect(ada).toContain('>Ada, a made-up builder</a>')
    expect(words(ada), 'a handle that differs from the name is drawn beside it').toContain(' ws-ada ')
    expect(words(ada)).toContain('claude-opus-5-5')
    expect(words(ada)).toContain(stateWord('finished', 'normal', 'session').text)
    expect(words(ada)).toContain(' Sealed ')
    expect(words(ada)).not.toContain('Not sealed')
    expect(words(ada)).toContain('1.25 USD')

    const bo = rowOf(html, 'ws-bo')
    expect(bo).toContain(runPage('run-bo'))
    expect(words(bo)).toContain(stateWord('running', 'normal', 'session').text)
    expect(words(bo)).toContain('Not sealed')
    expect(words(bo)).toContain('No receipt')

    const cy = rowOf(html, 'ws-cy')
    expect(words(cy), 'a run that recorded no model').toContain('Nobody recorded one.')
    expect(words(cy)).toContain('Its receipt gives no cost')
    expect(words(cy)).not.toContain('No receipt')

    const di = rowOf(html, 'ws-di')
    expect(di).not.toContain('href=')
    expect(words(di)).toContain('Di, a made-up writer')
    expect(words(di)).toContain(enWave13y['w13j.workers.wantedWord'])
    expect(words(di)).toContain('Nobody recorded one.')
    expect(words(di), 'a worker with no run is said to be sealed or not').not.toMatch(/Sealed|Not sealed|No receipt/)

    const ed = rowOf(html, 'ws-ed')
    expect(ed, 'a run that is not live here is a link').not.toContain('href=')
    expect(words(ed)).toContain(enWave13y['w13j.workers.runNotHereWord'].replace('{id}', 'run-ed-gone'))
    expect(words(ed)).toContain('luna-2, the model its launcher was given')

    const fy = rowOf(html, 'ws-fy')
    expect(words(fy)).toContain('Its launcher is starting it.')
    expect(words(fy)).toContain('luna-2, the model its launcher was given')

    const gone = rowOf(html, 'ws-gone')
    expect(words(gone)).toContain('Nothing was started: The brief changed after it was asked for.')
    expect(words(rowOf(html, 'ws-quiet'))).toContain(enWave13y['w13j.workers.failedNoReasonWord'])

    expect(words(rowOf(html, 'ws-hy')).match(/ws-hy/g), 'a name that is the handle is drawn twice').toHaveLength(1)

    expect(words(html)).toContain('1 more entry kept on this run could not be read as an ask.')
  })

  it('2: a run that asked for no worker draws nothing', () => {
    expect(renderToStaticMarkup(h(shown.TheWorkersOfARun, { workers: null }))).toBe('')
    expect(renderToStaticMarkup(h(shown.TheWorkersOfARun, { workers: undefined }))).toBe('')
  })
})
