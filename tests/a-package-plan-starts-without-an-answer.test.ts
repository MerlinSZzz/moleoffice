// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { GATES } from '../src/config/gates.mjs'
import { gateDefaultHere, gatePosition } from '../src/config/settings.mjs'
import { sayInEnglish, type WordKey } from '../src/shared/i18n.ts'
import { THE_FIRST_INSTRUCTION, theDelegationPart, theDelegationsFirstStep } from '../src/shared/round-start-pack.ts'

describe('starting work on a package', () => {
  it('gives the instruction to write the plan and start, including when an answer is pending', () => {
    expect(THE_FIRST_INSTRUCTION).toContain(sayInEnglish('roundStart.startAfterPlan' as WordKey))
    expect(THE_FIRST_INSTRUCTION).not.toContain(sayInEnglish('roundStart.waitForAnswer' as WordKey))
    expect(theDelegationsFirstStep('made-up-task', { taken: true, alignment: 'waiting' }))
      .toBe(sayInEnglish('roundStart.answerPending' as WordKey))
  })

  it('defaults the answer step off in both kinds of office and can switch it on', () => {
    const gate = GATES.find(row => row.id === 'package-alignment-answer')
    expect(gate).toBeDefined()
    expect(gateDefaultHere(gate!, 'checkout')).toBe('0')
    expect(gateDefaultHere(gate!, 'bundle')).toBe('0')
    expect(gatePosition(gate!.id, { [gate!.setting]: '1' })).toBe('1')
  })

  it('restores the instruction to wait when the switch is on', () => {
    const reading = { line: 'made-up', named: ['made-up-task'], answerRequired: true, tasks: [{ task: 'made-up-task', title: 'Made-up task', parent: { kind: 'decision' as const, id: 'made-up-parent' }, lines: ['made-up'], inside: { taken: true, alignment: 'none' as const }, points: [], materials: [] }] }
    expect(theDelegationPart(reading)).toContain(sayInEnglish('roundStart.waitForAnswer' as WordKey))
  })
})
