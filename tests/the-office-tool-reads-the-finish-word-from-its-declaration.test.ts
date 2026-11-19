// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE TOOL READS THE FINISH WORD FROM ITS ONE DECLARATION. tools/office-request.mjs decides from the request
 * alone whether a write may seal the run its environment names. The seal's receipt rides on that answer
 * (aSealOfThisRun). The finish words are declared once, as FINISHED_STATES in src/config/finished.mjs. A tool that
 * compared the state with a word of its own would miss a finish word added there, and nothing would fail.
 *
 * So the declaration is replaced here by one that adds a made-up finish word. The tool must take a write of that word
 * as one that may seal the run, and must still not take a word that says the run is going on.
 *
 * Mutations it catches:
 *   1. aWriteThatMaySealThisRun compares the state with its own literal word again: the made-up word goes red.
 *   2. It takes any state: the still-going words go red.
 */
import { describe, expect, it, vi } from 'vitest'

const A_MADE_UP_FINISH_WORD = 'a-made-up-finish-word'

vi.mock('../src/config/finished.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/finished.mjs')>()
  return { ...real, FINISHED_STATES: Object.freeze([...real.FINISHED_STATES, A_MADE_UP_FINISH_WORD]) }
})

const { FINISHED_STATES } = await import('../src/config/finished.mjs')
const { STILL_GOING_STATES } = await import('../src/config/still-going.mjs')
const { aSealOfThisRun, aWriteThatMaySealThisRun } = await import('../tools/office-request.mjs')

const RUN = 'aMadeUpRun01'
const ENV = { MOLE_OFFICE_SESSION: RUN }
const aWriteOf = (state: string) => ({ method: 'PATCH', path: `/api/records/${RUN}`, body: { dataPatch: { state } } })

describe('the office tool reads the finish word from its one declaration', () => {
  it('takes a write of every declared finish word as one that may seal the run, the made-up one too', () => {
    expect(FINISHED_STATES).toContain(A_MADE_UP_FINISH_WORD)
    for (const word of FINISHED_STATES) {
      expect(aWriteThatMaySealThisRun(aWriteOf(word), ENV), word).toBe(true)
      expect(aSealOfThisRun(aWriteOf(word), ENV), word).toBe(true)
    }
  })

  it('does not take a write of a word that says the run is going on', () => {
    expect(STILL_GOING_STATES.length).toBeGreaterThan(0)
    for (const word of STILL_GOING_STATES) {
      expect(aWriteThatMaySealThisRun(aWriteOf(word), ENV), word).toBe(false)
      expect(aSealOfThisRun(aWriteOf(word), ENV), word).toBe(false)
    }
  })
})
