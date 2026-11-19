// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S SENTENCE UNDER A PIPELINE SAYS IT IS STANDING STILL WHEN EVERY UNFINISHED STEP IS PAUSED.
 *
 * A decision settled problem RK4zJb6hJyV6. Change only
 * the home page's sentence. Every other path of the sentence stays as it was, and this file checks
 * each of them too: every
 * step done, some unfinished step not paused (even when the step it names is paused), and a
 * pipeline whose only unfinished step is paused. Made-up pipelines and steps only.
 *
 * THE PAUSE HAS TO REACH THE PAGE. Home asks for its pipelines and their steps by kind through
 * GET /api/records?kind=<kind>&shape=home, which cuts each block's data to what Home draws. The last
 * case asks that shape on a test office and reads its answer the way Home does, so a cut that
 * dropped `paused` would turn it red.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { buildTheFirstOfficeInAHook, apiApp, freshDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { pipelineLine } from '../src/web/components/home/pipeline-line.ts'
import { setWordLanguage } from '../src/shared/i18n.ts'
import type { ItemState } from '../src/shared/types.ts'
import type { Pause } from '../src/shared/work.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

const pause: Pause = { since: '2026-08-12 10:00:00', why: 'The test orchard is closed for the winter.' }

function step(name: string, state: ItemState, paused = false) {
  return { name, state, pause: paused ? pause : null }
}

afterEach(() => setWordLanguage('en'))

describe('the sentence under a pipeline on Home', () => {
  it('says the pipeline is standing still when every unfinished step is paused', () => {
    const blocks = [step('Pick the pears', 'done'), step('Sort the pears', 'doing', true), step('Pack the pears', 'todo', true)]
    expect(pipelineLine(blocks)).toBe('standing still: all 2 unfinished steps are paused')
    expect(pipelineLine([step('Pick the pears', 'done'), step('Sort the pears', 'failed', true)])).toBe(
      'standing still: its 1 unfinished step is paused',
    )
    setWordLanguage('zh')
    expect(pipelineLine(blocks)).toBe('停滞：未完成的 2 步都已暂停')
  })

  it('keeps naming the step it stands on when any unfinished step is not paused, even if that step is paused', () => {
    // pipelinePosition picks the failed step first, and that step is paused; the todo step is not.
    const blocks = [step('Pick the pears', 'done'), step('Sort the pears', 'todo'), step('Weigh the pears', 'failed', true)]
    expect(pipelineLine(blocks)).toBe('on step 3 of 3: Weigh the pears')
    expect(pipelineLine([step('Pick the pears', 'doing'), step('Pack the pears', 'todo')])).toBe('on step 1 of 2: Pick the pears')
  })

  it('says every step is done when nothing is unfinished, whether or not a done step carries a pause', () => {
    expect(pipelineLine([step('Pick the pears', 'done', true), step('Pack the pears', 'done')])).toBe('all 2 steps done')
  })
})

describe('what Home is sent about a pipeline', () => {
  it('carries each block\'s pause in the home shape, so the sentence can say the pipeline is standing still', async () => {
    const db = await freshDb()
    const { app } = await apiApp()
    const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
    const post = async (url: string, payload: unknown, method: 'POST' | 'PATCH' = 'POST') => {
      const reply = await app.inject({ method, url, headers, payload: payload as Record<string, unknown> })
      expect(reply.statusCode, reply.body).toBeLessThan(300)
      return reply.json()
    }
    try {
      await app.ready()
      const pipeline = (await post('/api/records', { kind: 'pipeline', title: 'Test lantern making', data: { blockIds: [] } })).record.id as string
      await post(`/api/records/${pipeline}/blocks`, { name: 'Cut the paper', state: 'done' })
      for (const [name, state] of [['Glue the frame', 'doing'], ['Fit the wick', 'todo']]) {
        const block = (await post(`/api/records/${pipeline}/blocks`, { name, state })).record.id as string
        await post(`/api/records/${block}`, { dataPatch: { paused: pause } }, 'PATCH')
      }
      // THE PIPELINES AND THE STEPS, ONE KIND EACH, joined as Home joins them.
      const replies = await Promise.all(
        ['pipeline', 'block'].map((kind) => app.inject({ method: 'GET', url: `/api/records?kind=${kind}&shape=home`, headers })),
      )
      for (const reply of replies) expect(reply.statusCode, reply.body).toBe(200)
      const { readPipelines } = await import('../src/web/lib/attention.ts')
      const { pipelines } = readPipelines(replies.flatMap((reply) => reply.json().records))
      expect(pipelines.map((one) => one.record.title)).toEqual(['Test lantern making'])
      expect(pipelineLine(pipelines[0]!.blocks)).toBe('standing still: all 2 unfinished steps are paused')
    } finally {
      await app.close()
      db.close()
    }
  })
})
