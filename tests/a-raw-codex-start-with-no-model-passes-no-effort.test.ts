// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RAW CODEX START WITH NO MODEL PASSES NO EFFORT, and its words say Codex's own configuration decides.
 *
 * The compatibility data used to give the raw command the owner's effort for a model nobody chose for it. Now the
 * launcher adds neither an effort nor a fast tier when the command names no model.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED: the effort and the words, because the old unnamed fallback answers the
 * effort xhigh and the start says so. The mutation puts that fallback back.
 */
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { aCommandsStartValues } from '../tools/sandbox-common.mjs'

describe('a raw Codex start with no model', () => {
  it('passes no effort and says Codex decides', () => {
    const command = ['codex', 'exec', '--json', '--', `Synthetic prompt ${randomUUID()}`]
    const given = aCommandsStartValues(command, { runtime: 'codex' })
    expect(given.command).toEqual(command)
    expect(given.start).toMatchObject({
      runtime: 'codex',
      model: null,
      effort: null,
      requestedEffort: null,
      effortFrom: 'none',
      fast: false,
    })
    expect(given.start!.words).toContain("Codex's own configuration decides")
    expect(given.start!.words).toContain('no effort')
  })
})
