// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic Casting rows prove the default roll without a store, launcher or provider. */
import { describe, expect, it } from 'vitest'
import {
  theCastingRoll, readCastingRoll, parseCastingReset, outsideTheWorkLabelled,
  type CastingRollAnswer, type CastingRollInput, type CastingRollRow, type CastingLimits,
} from '../src/shared/casting-roll.ts'
import { THE_INSPECTOR } from '../src/shared/roles.ts'

const rows: CastingRollRow[] = [
  { id: 20, program: 'claude-code', model: 'claude-opus-5-5', effort: 'xhigh', probability: 0.4, marked: true, labels: ['hard'], outUntil: null },
  { id: 21, program: 'codex', model: 'gpt-6.1-sol', effort: 'high', probability: 0.3, marked: false, labels: ['hard'], outUntil: null },
  { id: 22, program: 'dsh', model: 'deepseek-v4.1-flash', effort: null, probability: 0.6, marked: false, labels: ['simple'], outUntil: null },
  { id: 23, program: 'codex', model: 'openai/gpt-6-luna', effort: 'medium', probability: 0.4, marked: false, labels: ['simple'], outUntil: null },
  { id: 24, program: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: null, probability: 0.9, marked: false, labels: ['simple'], outUntil: null },
  { id: 25, program: 'opencode', model: 'opencode-go/gpt-6-luna', effort: 'high', probability: 1, marked: false, labels: [], outUntil: null },
  { id: 26, program: 'codex', model: 'gpt-6-astra', effort: 'high', probability: 0.3, marked: false, labels: ['hard'], outUntil: null },
  { id: 27, program: 'claude-code', model: 'claude-sonnet-5', effort: null, probability: 0.5, marked: false, labels: [], outUntil: null },
]
const limits: CastingLimits = { limited: [], unreadableStops: [], week: 'The sandboxes Claude week was not read.' }
const noRoll = (): number => { throw new Error('The random source must not be called.') }
const roll = (input: Partial<CastingRollInput> = {}) => theCastingRoll({
  role: 'worker', project: 'default', rows, difficulty: null, named: null, earlier: null, builderModel: null, limits, random: () => 0.5, ...input,
})
const limited = (runtime: string, model: string | null): CastingLimits['limited'][number] => ({
  runtime, model, run: 'stopped-run', kind: 'quota', at: '2026-10-13 09:00:00',
  until: Date.parse('2026-10-14T09:00:00Z'), zone: 'UTC', says: 'Run stopped-run reports quota until 2026-10-14 09:00:00 UTC.',
})

describe('the default Casting roll', () => {
  it('rolls inside hard, simple and every row in id order', () => {
    expect(roll({ difficulty: 'hard', random: () => 0.75 }).rowId).toBe(26)
    expect(roll({ difficulty: 'simple', random: () => 0.75 }).rowId).toBe(24)
    expect(roll({ random: () => 0.9 }).rowId).toBe(27)
    expect(roll({ difficulty: 'hard', random: () => 0.4 }).rowId).toBe(21)
  })

  it('keeps an actual earlier roll after its row disappears when its model is available', () => {
    const first = roll({ difficulty: 'hard', random: () => 0 })
    const next = roll({ earlier: { run: 'first-run', record: first.record }, difficulty: 'simple', rows: rows.slice(1),
      random: noRoll })
    expect(next).toMatchObject({ runtime: 'claude-code', model: 'claude-opus-5-5', effort: 'xhigh', rowId: 20 })
    expect(next.record).toMatchObject({ choice: 'kept', keptFrom: 'first-run', selected: first.record.selected })
    expect(next.record.notes.join(' ')).toContain('no longer')
    const named = roll({ named: { runtime: 'codex', model: 'gpt-6.1-sol', effort: null } })
    const marked = roll({ rows: rows.map(row => ({ ...row, probability: null })) })
    for (const prior of [named, marked]) expect(roll({ earlier: { run: 'not-a-roll', record: prior.record } }).record.choice).toBe('rolled')
  })

  it('does not keep an earlier roll while its model is limited, including if its row disappeared', () => {
    const first = roll({ difficulty: 'hard', random: () => 0 })
    for (const table of [rows, rows.slice(1)]) {
      const next = roll({ earlier: { run: 'first-run', record: first.record }, rows: table,
        limits: { ...limits, limited: [limited('claude-code', null)] }, random: noRoll })
      expect(next.record).toMatchObject({ choice: 'none', selected: null })
      expect(next.rowId).toBeNull()
      expect(next.says).toContain('stopped-run')
    }
  })

  it('does not keep an earlier roll while its row is still out, and keeps it again when available', () => {
    const first = roll({ difficulty: 'hard', random: () => 0 })
    const out = '2099-01-02T09:30:00Z'
    const earlier = { run: 'first-run', record: first.record }
    const unavailable = rows.map(row => row.id === first.rowId ? { ...row, outUntil: out } : row)
    const refused = roll({ earlier, rows: unavailable, random: noRoll })
    expect(refused.record).toMatchObject({ choice: 'none', selected: null })
    expect(refused.rowId).toBeNull()
    expect(refused.says).toContain(out)
    const available = roll({ earlier, rows, random: noRoll })
    expect(available.record).toMatchObject({ choice: 'kept', keptFrom: 'first-run', selected: first.record.selected })
  })

  it('skips a limited row and names its run, stop and deadline', () => {
    const answer = roll({ difficulty: 'hard', random: () => 0, limits: { ...limits, limited: [limited('claude-code', null)] } })
    expect(answer.rowId).toBe(21)
    expect(answer.record.skipped.find(row => row.rowId === 20)?.reasons.join(' ')).toMatch(/stopped-run.*quota.*2026-10-14/)
    expect(answer.record.candidates.map(row => row.rowId)).toEqual([21, 26])
  })

  it('answers no model when the whole group is limited or has zero weight', () => {
    const answer = roll({ difficulty: 'hard', random: noRoll, limits: { ...limits, limited: [
      limited('claude-code', null), limited('codex', 'gpt-6.1-sol'), limited('codex', 'gpt-6-astra'),
    ] } })
    expect(answer).toMatchObject({ runtime: null, model: null, effort: null, rowId: null, record: { choice: 'none' } })
    for (const id of [20, 21, 26]) expect(answer.says).toContain(`Row ${id}`)
    expect(answer.says).toContain('stopped-run')
    // The group's only row above 0 is limited and the others are at 0, so nothing can be drawn and the limit is said.
    const above = rows.find(row => row.labels.includes('hard') && row.marked)!
    const zero = roll({ difficulty: 'hard', random: noRoll, limits: { ...limits, limited: [limited(above.program!, null)] },
      rows: rows.map(row => row.labels.includes('hard') && row.id !== above.id ? { ...row, probability: 0 } : row) })
    expect(zero.record.choice).toBe('none')
    expect(zero.says).toContain('zero')
  })

  it('records the selected row, probability, normalised share and number drawn', () => {
    const answer = roll({ difficulty: 'simple', random: () => 0.75 })
    expect(answer.record.selected).toEqual({ rowId: 24, program: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: null, probability: 0.9, share: 0.9 / 1.9, number: 0.75 })
    expect(answer.record.candidates).toEqual([
      { rowId: 22, program: 'dsh', model: 'deepseek-v4.1-flash', effort: null, probability: 0.6, share: 0.6 / 1.9 },
      { rowId: 23, program: 'codex', model: 'openai/gpt-6-luna', effort: 'medium', probability: 0.4, share: 0.4 / 1.9 },
      { rowId: 24, program: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: null, probability: 0.9, share: 0.9 / 1.9 },
    ])
    expect(readCastingRoll(answer.record)).toEqual(answer.record)
  })

  it('leaves the builders model out of the inspectors default', () => {
    const answer = roll({ role: 'inspector', difficulty: 'hard', builderModel: 'claude-opus-5-5', random: () => 0 })
    expect(answer.rowId).toBe(21)
    expect(answer.record.skipped.find(row => row.rowId === 20)?.reasons.join(' ')).toContain('builder')
    expect(roll({ role: 'inspector', difficulty: 'simple', builderModel: 'gpt-6-luna', random: () => 0.35 }).rowId).toBe(22)
  })

  it('uses a named model unchanged without drawing a number', () => {
    const answer = roll({ named: { runtime: 'opencode', model: 'opencode-go/gpt-6-luna', effort: 'low' }, limits: { ...limits, limited: [limited('opencode', null)] }, random: noRoll })
    expect(answer).toMatchObject({ runtime: 'opencode', model: 'opencode-go/gpt-6-luna', effort: 'low', rowId: null, record: { choice: 'named' } })
    expect(answer.says).toContain('named')
  })

  it('takes the marked row when the group has no probabilities and records every caveat', () => {
    const answer = roll({ role: 'inspector', builderModel: 'claude-opus-5-5', difficulty: 'simple', random: noRoll,
      rows: rows.map(row => ({ ...row, probability: null })) })
    expect(answer).toMatchObject({ rowId: 20, runtime: 'claude-code', model: 'claude-opus-5-5', effort: 'xhigh', record: { choice: 'marked' } })
    expect(answer.says).toContain('no probability')
    const notes = answer.record.notes.join(' ')
    // The marked row carries hard, not simple, and the note says so in the roll's own words. Mutation caveat: the
    // reason names no label. Red: the note does not say the row is outside simple.
    expect(notes).toContain(outsideTheWorkLabelled('simple'))
    expect(notes).toContain('builder')
    for (const row of rows) expect(answer.record.skipped.some(one => one.rowId === row.id)).toBe(true)
  })

  it('does not take a limited marked row when the group has no positive probability', () => {
    for (const probability of [null, 0]) {
      const answer = roll({ difficulty: 'hard', random: noRoll,
        rows: rows.map(row => ({ ...row, probability })), limits: { ...limits, limited: [limited('claude-code', null)] } })
      expect(answer.record).toMatchObject({ choice: 'none', selected: null })
      expect(answer.rowId).toBeNull()
      expect(answer.says).toContain('stopped-run')
    }
  })

  it('never rolls OpenCode Luna, and rolls OpenCode Go DeepSeek when nothing says Go is limited', () => {
    for (const difficulty of [null, 'simple'] as const) {
      const answer = roll({ difficulty, random: () => 0.999999 })
      expect(answer.rowId).not.toBe(25)
      expect(answer.record.candidates.map(row => row.rowId)).not.toContain(25)
      expect(answer.record.candidates.map(row => row.rowId)).toContain(24)
    }
    const only = roll({ difficulty: 'simple', rows: rows.filter(row => row.id === 24 || row.id === 25), random: () => 0.5 })
    expect(only).toMatchObject({ runtime: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', rowId: 24 })
  })

  it('answers the Codex route for either spelling of Luna', () => {
    for (const model of ['gpt-6-luna', 'openai/gpt-6-luna']) {
      expect(roll({ rows: [{ ...rows[3]!, model }], random: () => 0 })).toMatchObject({ runtime: 'codex', model: 'gpt-6-luna' })
      expect(roll({ rows: [{ ...rows[3]!, model }], limits: { ...limits, limited: [limited('codex', 'gpt-6-luna')] }, random: noRoll }).model).toBeNull()
    }
    expect(roll({ rows: [{ ...rows[5]!, probability: null, marked: true }], random: noRoll })).toMatchObject({ runtime: 'codex', model: 'gpt-6-luna', rowId: 25 })
  })

  it('parses both provider reset forms with their zones and rejects unreadable words', () => {
    expect(parseCastingReset('7:10pm (Europe/London)', Date.parse('2026-10-13T19:00:00Z'), 'UTC')).toEqual({ until: Date.parse('2026-10-14T18:10:00Z'), zone: 'Europe/London', usedOfficeZone: false })
    expect(parseCastingReset('Sep 17th, 2026 11:41 PM', Date.parse('2026-09-17T10:00:00Z'), 'Europe/London')).toEqual({ until: Date.parse('2026-09-17T22:41:00Z'), zone: 'Europe/London', usedOfficeZone: true })
    expect(parseCastingReset('1:30am (Europe/London)', Date.parse('2026-10-25T00:45:00Z'), 'UTC')?.until).toBe(Date.parse('2026-10-25T01:30:00Z'))
    for (const words of [null, 'tomorrow', '25:10pm (Europe/London)', '7:10pm (Nowhere/Here)', 'Feb 30th, 2026 11:41 PM']) {
      expect(parseCastingReset(words, Date.parse('2026-10-13T19:00:00Z'), 'UTC')).toBeNull()
    }
  })

  it('names an unreadable reset without treating it as a limit', () => {
    const unreadableStops: CastingLimits['unreadableStops'] = [{ run: 'unreadable-stop', runtime: 'claude-code', model: 'claude-opus-5-5', kind: 'quota', at: '2026-10-13 09:00:00', resetsAt: 'tomorrow', says: 'Run unreadable-stop reset could not be read.' }]
    const answer = roll({ difficulty: 'hard', random: () => 0, limits: { ...limits, unreadableStops } })
    expect(answer.rowId).toBe(20)
    expect(answer.record.unreadableStops).toEqual(unreadableStops)
    expect(answer.record.week).toContain('not read')
  })

  it('strictly reads every choice and refuses broken stored rolls', () => {
    const good = roll().record
    for (const answer of [roll(), roll({ named: { runtime: 'codex', model: 'gpt-6-luna', effort: null } }), roll({ rows: rows.map(row => ({ ...row, probability: null })) }), roll({ rows: rows.map(row => ({ ...row, probability: 0 })) }), roll({ earlier: { run: 'prior', record: good } })]) {
      expect(readCastingRoll(answer.record)).toEqual(answer.record)
    }
    expect(readCastingRoll(undefined)).toBeNull()
    for (const bad of [null, {}, { ...good, surprise: true }, { ...good, selected: { ...good.selected, number: 1 } }, { ...good, selected: null }, { ...good, candidates: [{ rowId: 20 }] }, { ...good, keptFrom: 'not-kept' }]) {
      expect(() => readCastingRoll(bad)).toThrow(/Casting roll/)
    }
  })
})

/** Which row a roll takes and how, read from its record and never from its words. */
const taken = (answer: CastingRollAnswer) => ({
  choice: answer.record.choice, selected: answer.record.selected?.rowId ?? null, candidates: answer.record.candidates,
  runtime: answer.runtime, model: answer.model, effort: answer.effort, rowId: answer.rowId,
})
const hard = rows.filter(row => row.labels.includes('hard'))
const theMarked = hard.find(row => row.marked)!
/** The table with every row of the hard group set to this probability, and every other row as it was. */
const hardAt = (probability: number | null, table: readonly CastingRollRow[] = rows) =>
  table.map(row => row.labels.includes('hard') ? { ...row, probability } : row)

describe('an out-until time also applies to the marked fallback', () => {
  it('does not select a marked row still out when weights are empty or zero', () => {
    const out = '2099-01-02T09:30:00Z'
    for (const probability of [null, 0]) {
      const table = hardAt(probability).map(row => row.marked ? { ...row, outUntil: out } : row)
      const answer = roll({ difficulty: 'hard', rows: table, random: noRoll })
      expect(answer.record).toMatchObject({ choice: 'none', selected: null })
      expect(answer.rowId).toBeNull()
      expect(answer.says).toContain(out)
    }
    const returned = roll({ difficulty: 'hard', rows: hardAt(0), random: noRoll })
    expect(returned.record).toMatchObject({ choice: 'marked', selected: { rowId: theMarked.id } })
  })
})

describe('a probability of 0 only means a row is not drawn', () => {
  it('takes the marked row for a group whose rows are all at 0, as for a group with no probability', () => {
    const empty = roll({ difficulty: 'hard', rows: hardAt(null), random: noRoll })
    expect(empty.record).toMatchObject({ choice: 'marked', selected: { rowId: theMarked.id } })
    expect(taken(roll({ difficulty: 'hard', rows: hardAt(0), random: noRoll }))).toEqual(taken(empty))
  })

  it('takes the marked row for a check whose only row above 0 is the builders model', () => {
    const builder = hard.find(row => !row.marked)!
    const check = { role: THE_INSPECTOR, difficulty: 'hard', builderModel: builder.model, random: noRoll } as const
    const table = rows.map(row => !row.labels.includes('hard') || row.id === builder.id ? row : { ...row, probability: row.marked ? null : 0 })
    expect(table.filter(row => row.labels.includes('hard') && (row.probability ?? 0) > 0).map(row => row.id)).toEqual([builder.id])
    const empty = roll({ ...check, rows: hardAt(null) })
    expect(empty.record).toMatchObject({ choice: 'marked', selected: { rowId: theMarked.id } })
    expect(taken(roll({ ...check, rows: table }))).toEqual(taken(empty))
  })

  it('draws only the row above 0 when the other row of the group is at 0', () => {
    const above = hard.find(row => !row.marked)!
    const table = [{ ...theMarked, probability: 0 }, above]
    for (const number of [0, 0.5, 0.999999]) {
      const answer = roll({ difficulty: 'hard', rows: table, random: () => number })
      expect(answer.record).toMatchObject({ choice: 'rolled', selected: { rowId: above.id } })
      expect(answer.rowId).toBe(above.id)
    }
  })

  it('answers a group at 0 with no marked row as it answers the group with no probability', () => {
    const unmarked = rows.map(row => ({ ...row, marked: false }))
    const empty = roll({ difficulty: 'hard', rows: hardAt(null, unmarked), random: noRoll })
    expect(empty.record).toMatchObject({ choice: 'none', selected: null })
    expect(taken(roll({ difficulty: 'hard', rows: hardAt(0, unmarked), random: noRoll }))).toEqual(taken(empty))
  })
})
