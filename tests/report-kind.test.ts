// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE `report` KIND: WRITING FOR A PERSON, KEPT INSIDE PANELX.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE FOR
 * ---------------------------------------------------------------------------------------
 *
 * The owner's rule is that a formal report or review is read inside Mole Office rather than as a link to
 * a page somewhere else. Mole Office could not hold one: rich content had exactly one home, a module's
 * `summaryBlocks`, and no module had ever carried a single block. A note holds one plain string.
 *
 * So a report is its own kind, and these tests pin the four decisions that make it one rather than
 * a note with extra fields:
 *
 *   1. IT REUSES THE BLOCK SHAPE. `blocks` accepts every block type a module accepts, in the same
 *      shape, so a chart on a report is the chart a module draws. A second block vocabulary would
 *      be two declarations of one shape, which is this repository's recurring defect.
 *   2. A CHART IS ALLOWED HERE, and the published rule says so. That rule used to read "a module's
 *      summaryBlocks and nowhere else", and a rule stated in one place and broken in another is the
 *      same defect wearing a different hat. Both halves are checked, in both directions.
 *   3. ABSENCE IS THE THIRD ANSWER FOR `read`. Read, unread, and nobody has said.
 *   4. A REPORT IS NOT WORK. A plan cannot give it hours, and the refusal says what to plan instead.
 *
 * NO DATABASE. Everything here is a pure read of the declarations and the checker they drive.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'
import {
  KIND_SPECS,
  REPORT_READ_ANSWERS,
  completenessOf,
  validateData,
  type ValidationError,
} from '../src/shared/kinds.ts'
import { RECORD_KINDS } from '../src/shared/types.ts'
import {
  planHoursRuleOf,
} from '../src/shared/work.ts'

/** One chart block, valid as written. The block type the rule below is about. */
const CHART = {
  id: 'b-chart',
  type: 'chart',
  spec: {
    kind: 'line',
    x: { label: 'trial' },
    y: { label: 'reprojection error', unit: 'px' },
    series: [{ id: 's1', name: 'wrist camera', points: [{ x: 1, y: 0.4 }, { x: 2, y: 1.9 }] }],
  },
} as const

/** A complete report, so a test about one field is not also a test about the others. */
const REPORT = {
  for: `${THE_TEST_OFFICES_OWNER.name}, who asked for the review`,
  date: '2026-08-14',
  blocks: [{ id: 'b-1', type: 'text', text: 'The mount held calibration through a full handover.' }],
}

function accept(kind: 'report' | 'module', data: unknown): Record<string, unknown> {
  const result = validateData(kind, data)
  if (!result.ok) throw new Error(`expected this ${kind} to be accepted, but: ${result.errors.map((e) => e.message).join(' | ')}`)
  return result.data
}

function refusal(kind: 'report' | 'module', data: unknown): ValidationError[] {
  const result = validateData(kind, data)
  if (result.ok) throw new Error(`expected this ${kind} to be refused, but it was accepted: ${JSON.stringify(data)}`)
  return result.errors
}

// ============================================================ it is declared, and it is not a note

describe('a report is its own kind', () => {
  it('is declared, and its own worked example is one the checker accepts', () => {
    expect(RECORD_KINDS).toContain('report')
    const spec = KIND_SPECS.report
    expect(spec.kind).toBe('report')
    // Every kind here carries an example somebody can copy. One that does not validate is worse
    // than none: it is a refusal the schema itself told them to write.
    expect(validateData('report', spec.example).ok, JSON.stringify(spec.example)).toBe(true)
    // An agent may write one. That is the whole point — the reviews being written today are
    // written by agents, and a human-only kind would leave them back outside the product.
    expect(spec.humanOnly).toBe(false)
  })

})

// ============================================================ the body is the shape that exists

describe('the body reuses the block shape rather than declaring a second one', () => {
  it('accepts every block type a module accepts, in the same shape', () => {
    const one = (block: unknown) => accept('report', { ...REPORT, blocks: [block] })
    one({ id: 'b-t', type: 'text', heading: 'What I found', text: 'The mast moved.' })
    one({ id: 'b-m', type: 'math', tex: 'e = m c^2' })
    one({ id: 'b-i', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/PROJECTS/x/docs/grip.png`, alt: 'The gripper holding the cube' })
    one({ id: 'b-tab', type: 'table', columns: [{ label: 'run' }], rows: [{ cells: ['before'] }] })
    // And a half-written block is refused here exactly as it is on a module: an axis with no label
    // is a number with no unit, which is how a plot lies.
    const errors = refusal('report', { ...REPORT, blocks: [{ ...CHART, spec: { ...CHART.spec, y: {} } }] })
    expect(errors.map((e) => e.path)).toContain('data.blocks[0].spec.y.label')
  })

  it('sends an author who wrote `summaryBlocks` here to `blocks`, and never to `extra`', () => {
    // The failure this line exists to stop: an agent that learnt Mole Office on modules writes the
    // module's spelling, the two words are eight edits apart, and the generic refusal would offer
    // `extra` — where a whole report would sit as text no page draws.
    const message = refusal('report', { ...REPORT, summaryBlocks: [] }).map((e) => e.message).join(' ')
    expect(message).toContain('did you mean "blocks"?')
    expect(message).not.toMatch(/goes inside "extra"|Anything this kind has no field for/)
  })

  it('answers `about` with the link to write, because that is how a report says what it is about', () => {
    // A report is defined by being about something, so this is the key an author reaches for. There
    // is no field: `about` is a link, and the module it reviews reads back as "subject of" it.
    const message = refusal('report', { ...REPORT, about: 'the wrist camera module' }).map((e) => e.message).join(' ')
    expect(message).toContain('POST /api/links')
    expect(message).toContain('"type":"about"')
    expect(message).not.toMatch(/goes inside "extra"|Anything this kind has no field for/)
    // And the rule is published as well as enforced, because a caller reading GET /api/kinds cannot
    // see the refusal until they have already made the write.
    expect(KIND_SPECS.report.rules?.join(' ')).toContain('"type":"about"')
  })
})

// ============================================================ the chart rule, in both directions

describe('a chart is allowed in a report, and the published rule says the same', () => {
  it('stores a chart written into a report, and one written into a module, and nowhere else', () => {
    accept('report', { ...REPORT, blocks: [CHART] })
    accept('module', { context: 'why it exists', parts: [], summaryBlocks: [CHART] })
    // The "nowhere else" half. A chart in any other key is refused and nothing is stored, which is
    // what makes the sentence in ChartBlock's description true rather than aspirational.
    expect(refusal('report', { ...REPORT, charts: [CHART] }).length).toBeGreaterThan(0)
    expect(refusal('module', { context: 'why it exists', parts: [], charts: [CHART] }).length).toBeGreaterThan(0)
  })

  it('points an author who wrote `charts` at whichever of the two their kind has', () => {
    expect(refusal('report', { ...REPORT, charts: [] }).map((e) => e.message).join(' ')).toContain('did you mean "blocks"?')
    expect(
      refusal('module', { context: 'why it exists', parts: [], charts: [] }).map((e) => e.message).join(' '),
    ).toContain('did you mean "summaryBlocks"?')
  })
})

// ============================================================ who it is for, when, and whether read

describe('who it is for and which day it is about are what a report is incomplete without', () => {
  it('stores a report that is missing them, and says what it still wants', () => {
    // Rule 3 of kinds.ts: wrong is refused, absent is reported. A review is opened before it is
    // finished, and a validator that demanded ceremony would be routed around.
    const result = validateData('report', { blocks: [] })
    expect(result.ok).toBe(true)
    const wanted = completenessOf('report', { blocks: [] }).map((i) => i.path)
    expect(wanted).toContain('data.for')
    expect(wanted).toContain('data.date')
  })

  it('reports nothing missing once they are written', () => {
    expect(completenessOf('report', REPORT).map((i) => i.path)).toEqual([])
  })
})

describe('whether it has been read has three answers, and the third is no answer', () => {
  it('takes read and unread, and nothing else', () => {
    expect([...REPORT_READ_ANSWERS]).toEqual(['read', 'unread'])
    for (const answer of REPORT_READ_ANSWERS) accept('report', { ...REPORT, read: answer })
    expect(refusal('report', { ...REPORT, read: 'maybe' }).map((e) => e.path)).toEqual(['data.read'])
    // A boolean would be the same two answers with the third one spelled `false`, which is the
    // guess this field is shaped to refuse.
    expect(refusal('report', { ...REPORT, read: true }).map((e) => e.path)).toEqual(['data.read'])
  })

  it('treats a report with no answer as complete, because nobody having said is not a gap to nag about', () => {
    const field = KIND_SPECS.report.fields.find((f) => f.key === 'read')
    expect(field?.required, 'nobody has said is an answer, not an unfinished record').toBe(false)
    expect(completenessOf('report', REPORT).map((i) => i.path)).not.toContain('data.read')
    expect(field?.description, 'must say absent is not the same as unread').toMatch(/absent is not/i)
  })
})

// ============================================================ it is not work

describe('a report is not work and cannot be given hours', () => {
  it('refuses hours with a sentence saying what to plan instead', () => {
    const rule = planHoursRuleOf('report')
    expect(rule.mayHaveHours).toBe(false)
    // The refusal is what a person reads when they try to plan one, so it has to name the thing
    // they should plan: writing the report is a task, and the task is what holds the hours.
    expect(rule.why).toContain('task')
  })
})
