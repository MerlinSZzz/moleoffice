// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import {
  A_HOOK_THAT_STARTS_SOMETHING,
  A_TEST_THAT_STARTS_SOMETHING,
  STARTERS,
  startsSomethingOutsideTheTestProcess,
} from './how-long-a-test-may-take.ts'

describe('the budget this file was given', () => {
  it('is the long one, because this file starts something', (ctx) => {
    expect(ctx.task.timeout).toBe(A_TEST_THAT_STARTS_SOMETHING)
  })

  it('is thirty seconds, which is the number the rule states', () => {
    expect(A_TEST_THAT_STARTS_SOMETHING).toBe(30_000)
    expect(A_HOOK_THAT_STARTS_SOMETHING).toBe(240_000)
  })
})

describe('what the rule counts as starting something', () => {
  it('says yes to a file that starts a stack through the helper', () => {
    const source = 'const app = await liveApp({ name: "x", viewport: { width: 1440, height: 990 } })'
    expect(startsSomethingOutsideTheTestProcess(source)).toBe(true)
  })

  it('says no to a file that only calls functions', () => {
    const source = 'const t = await freshDb()\nexpect(t.records.list().length).toBe(0)'
    expect(startsSomethingOutsideTheTestProcess(source)).toBe(false)
  })

  it('says yes to every word it knows', () => {
    for (const starter of STARTERS) {
      expect(
        startsSomethingOutsideTheTestProcess(`something ${starter.name} something`),
        `${starter.name} starts ${starter.starts} and the rule did not notice it`,
      ).toBe(true)
    }
  })

  it('matches a whole word, not a fragment of a longer one', () => {
    expect(startsSomethingOutsideTheTestProcess('the word chromiumlike is not the word')).toBe(false)
  })
})

