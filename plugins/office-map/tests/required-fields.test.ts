// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { readView, readViewSlices } from '../src/read.ts'
import { people, work } from './fixtures.ts'

it('keeps sliced container validation identical to the original decoder', () => {
  const projects = { interface: people.interface, view: 'projects' as const, projects: [], narrowedByPermission: null }
  for (const [view, body] of [['projects', projects], ['people', people], ['work', work]] as const) {
    const drain = (raw: unknown) => { const steps = readViewSlices(view, raw); let next = steps.next(); while (!next.done) next = steps.next(); return next.value }
    expect(drain(body)).toEqual(readView(view, body))
    const array = Object.assign([], structuredClone(body))
    expect(readView(view, array)).toBeNull(); expect(drain(array)).toBeNull()
    expect(drain([])).toBeNull(); expect(drain(null)).toBeNull()
  }
})

it('rejects a roster reading that omits appearance rather than inventing a default', () => {
  const body = JSON.parse(JSON.stringify(people))
  delete body.agents[0].appearance
  expect(readView('people', body)).toBeNull()
})

it('rejects work that omits its original state rather than displaying it as null', () => {
  const body = JSON.parse(JSON.stringify(work))
  delete body.work[0].recordedState
  expect(readView('work', body)).toBeNull()
})

it('preserves explicit null and unfamiliar values of both published unknown fields', () => {
  const roster = structuredClone(people)
  roster.agents[0]!.appearance = null
  roster.agents[1]!.appearance = { version: 99, storedChoice: 'keep' }
  expect(readView('people', roster)).toEqual(roster)
  const reading = structuredClone(work)
  reading.work[0]!.recordedState = null
  reading.work[1]!.recordedState = { value: ['future', 5] }
  expect(readView('work', reading)).toEqual(reading)
})
