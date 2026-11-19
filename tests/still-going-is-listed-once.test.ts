// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'

import { stillGoing } from '../src/config/own-rows.mjs'

it('calls a row still going when its state is one of them and nobody closed it', () => {
  const row = (data: Record<string, unknown>) => ({ id: 'a-fixture-row', title: 'A fixture row', data })
  expect(stillGoing(row({ state: 'running' }))).toBe(true)
  expect(stillGoing(row({ state: 'idle' }))).toBe(true)
  expect(stillGoing(row({ state: 'idle', closedBecause: 'Its process is gone.' }))).toBe(false)
  expect(stillGoing(row({ state: 'crashed' }))).toBe(false)
})
