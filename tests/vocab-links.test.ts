// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TASK STATES ITS DEPENDENCY ONCE, AS A LINK, AND KEEPS ITS PROSE FIELD WHERE NOTHING ELSE REPLACES IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `task.blocked_by` asked for the dependency a second time, in prose, in the same request as
 * the `blocks` link — one fact asked for twice, in a product whose house rule is one statement per
 * fact. Which of the two was canonical was a measurement rather than a preference: the link is read
 * by the gate rule, the attention rule, `unmetDependencies`, the record page and the graph, and
 * `data.blocked_by` was read by nothing.
 * The field is gone from `task` and kept on `obligation`, which has no `also_waiting_on` to move
 * prose into and no replacement for it.
 *
 * NO DATABASE. A pure read of the declarations.
 */

import { describe, expect, it } from 'vitest'
import { validateData } from '../src/shared/kinds.ts'

describe('a task states its dependency once, as a link', () => {
  it('refuses the old key with the link to write instead, and does not send it to `extra`', () => {
    const result = validateData('task', { state: 'blocked', blocked_by: 'the reprint cracked' })
    expect(result.ok, 'a task still accepts blocked_by, so the fact can still be stored twice').toBe(false)
    if (result.ok) return

    const message = result.errors.map((e) => e.message).join(' ')
    expect(message).toContain('blocked_by')
    expect(message).toContain('"type":"blocks"')
    expect(message).toContain('also_waiting_on')
    // The refusal an agent follows must not land the dependency in the declared bag: `extra` is
    // stored and read by nothing, so a dependency written there exists as text only, draws no edge,
    // answers no query — and comes back 201.
    expect(message).toContain('DO NOT PUT IT IN "extra"')
  })

  it('accepts the prose in the field that is for prose', () => {
    const result = validateData('task', { state: 'blocked', also_waiting_on: 'a reprinted gripper at effort 12' })
    expect(result.ok, result.ok ? '' : result.errors.map((e) => e.message).join(' | ')).toBe(true)
  })
})

describe('an obligation keeps its `blocked_by`, and that is not an oversight', () => {
  it('accepts it on a write, so the moved-key refusal cannot shadow a live field', () => {
    const result = validateData('obligation', {
      due: '2026-08-14',
      blocked_by: 'the effort 15 print cracked before the force table was finished',
    })
    expect(result.ok, result.ok ? '' : result.errors.map((e) => `${e.path}: ${e.message}`).join(' | ')).toBe(true)
  })
})
