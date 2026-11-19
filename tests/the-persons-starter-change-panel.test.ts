// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { StarterChangeDetails, starterPressBody } from '../src/web/components/AgentStarterMove.tsx'
import type { AStarterChange } from '../src/shared/agent-starter.ts'

const person = { kind: 'person' as const, id: 'person', name: 'Person' }
const agent = { kind: 'agent' as const, id: 'new', name: 'New starter' }
const change: AStarterChange = { id: 'change', agent: 'worker', from: person, to: agent, askedBy: person, because: 'A reason', askedAt: '2026-01-01 12:00:00', state: 'waiting', appliedAt: null, refusedBecause: null, runsNotEnded: ['run'] }
const words = (state: AStarterChange) => renderToStaticMarkup(createElement(StarterChangeDetails, { change: state })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

it('tells the person what is waiting, what happened to it, and builds the three presses', () => {
  expect(words(change)).toContain('New starter')
  expect(words(change)).toContain('waiting')
  expect(words(change)).toContain('Person')
  expect(words(change)).not.toContain('2026-01-01 12:00:00')
  expect(words(change)).toContain('2026')
  expect(words(change)).toContain('12:00')
  expect(words({ ...change, state: 'withdrawn' })).toContain('withdrawn')
  expect(words({ ...change, state: 'refused', refusedBecause: 'The chain changed' })).toContain('The chain changed')
  expect(words({ ...change, state: 'applied', appliedAt: '2026-01-01 13:00:00' })).toContain('applied')
  expect(starterPressBody('new', 'A reason')).toEqual({ to: 'new', because: 'A reason' })
  expect(starterPressBody('new', 'A reason', true)).toEqual({ to: 'new', because: 'A reason', atOnce: true })
  expect(starterPressBody()).toEqual({ withdraw: true })
})
