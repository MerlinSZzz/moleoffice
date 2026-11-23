// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { readView, readViewSlices } from '../src/read.ts'
import { people, work } from './fixtures.ts'

describe('sliced reads preserve optional keys', () => {
  it.each([
    { view: 'people', body: people, presence: 'absent' },
    { view: 'people', body: { ...people, notAgents: [] }, presence: 'present' },
    { view: 'work', body: work, presence: 'absent' },
    { view: 'work', body: { ...work, notAgents: [] }, presence: 'present' },
  ] as const)('matches the whole $view read with notAgents $presence', ({ view, body }) => {
    const slices = readViewSlices(view, body)
    let next = slices.next()
    while (!next.done) next = slices.next()
    const whole = readView(view, body)

    expect(whole).not.toBeNull()
    expect(next.value).not.toBeNull()
    expect(next.value).toStrictEqual(whole)
    expect(Object.keys(next.value!).sort()).toStrictEqual(Object.keys(whole!).sort())
  })
})
