// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The contract for what belongs inside a record's `data`, and the check that enforces it.
 *
 * Three things are being tested here, and the first one is not the interesting one.
 *
 *   1. That bad data is refused. That is the easy half.
 *   2. That the REFUSAL IS USABLE by whoever wrote the record. Every assertion below that reads
 *      a message is deliberate: a validator that says "invalid input" has moved the problem
 *      rather than solved it, because the agent that wrote the record still cannot see the
 *      source and still has to guess which of eleven fields it got wrong.
 *   3. That MISSING IS NOT WRONG. A module with only a title is stored, and reports the two
 *      things it still wants; the same module with a context reports one; with parts, none.
 *      That progression is a feature and not an accident, so it is tested as one. The reason it
 *      is a feature: refusing an unfinished record means nothing can be opened until it is
 *      finished, and the author who cannot file what they know now writes a markdown file
 *      instead — which is the state this whole application exists to get out of.
 *
 * The payload at the top is not invented. It is the exact body an audit sent to a running
 * Mole Office, which was answered with a 201.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectPanelError, freshDb, one, type TestDb } from './helpers.ts'
import {
  CLAIM_STATES,
  KIND_SPECS,
  SHAPE_SPECS,
  completenessOf,
  suggestKey,
  validateData,
  validateShape,
  type FieldSpec,
  type Incompleteness,
  type ValidationError,
} from '../src/shared/kinds.ts'
import {
  DIRECTION_DEPTHS,
  HUMAN_ONLY_KINDS,
  RECORD_KINDS,
  SESSION_STATES,
  SUMMARY_BLOCK_TYPES,
  type BlockData,
  type RecordKind,
} from '../src/shared/types.ts'
import { SESSION_STATES as ATTENTION_SESSION_STATES } from '../src/web/lib/attention.ts'

/** The errors for a payload that must be refused, or a failure that says it was accepted. */
function refusal(kind: RecordKind, data: unknown): ValidationError[] {
  const result = validateData(kind, data)
  if (result.ok) throw new Error(`expected ${kind} data to be refused, but it was accepted: ${JSON.stringify(data)}`)
  return result.errors
}

/** The one error whose path matches, or a failure naming the paths that were actually reported. */
function errorAt(errors: readonly ValidationError[], path: string): ValidationError {
  const found = errors.filter((e) => e.path === path)
  const [first, ...rest] = found
  if (first === undefined || rest.length > 0) {
    throw new Error(`expected exactly one error at ${path}, got ${found.length}. All paths: ${errors.map((e) => e.path).join(', ')}`)
  }
  return first
}

function accept(kind: RecordKind, data: unknown): Record<string, unknown> {
  const result = validateData(kind, data)
  if (!result.ok) {
    throw new Error(`expected ${kind} data to be accepted, but: ${result.errors.map((e) => e.message).join(' | ')}`)
  }
  return result.data
}

/**
 * What data that is ACCEPTED is still missing.
 *
 * It fails rather than returns when the data is refused, because "it reported no incompleteness"
 * and "it was never stored" are opposite outcomes that an unchecked `result.ok` would blur.
 */
function missing(kind: RecordKind, data: unknown): Incompleteness[] {
  const result = validateData(kind, data)
  if (!result.ok) {
    throw new Error(`expected ${kind} data to be accepted, but: ${result.errors.map((e) => e.message).join(' | ')}`)
  }
  return result.incomplete
}

/** Just the paths, for the tests about which fields are reported rather than how. */
const missingPaths = (kind: RecordKind, data: unknown): string[] => missing(kind, data).map((i) => i.path)

// ============================================================================ the audit payload

describe('the payload that used to return 201', () => {
  const AUDIT_PAYLOAD = { contxet: 'typo key', parts: 'should be an array', bogusField: 123 }

  it('is refused, and every one of the three faults is reported', () => {
    const errors = refusal('module', AUDIT_PAYLOAD)
    // Three faults, three errors. `context` is absent as well — the typo was meant to be it —
    // and that is deliberately NOT reported here: a missing field is not a fault, and a refused
    // write has no stored record to be incomplete. The writer is told what is WRONG now, and
    // what is UNFINISHED once there is something to finish.
    expect(errors.map((e) => e.path).sort()).toEqual(['data.bogusField', 'data.contxet', 'data.parts'])
  })

  it('names the misspelt key and the key it was nearly', () => {
    const message = errorAt(refusal('module', AUDIT_PAYLOAD), 'data.contxet').message
    expect(message).toBe('unknown key "contxet" — did you mean "context"?')
  })

  it('says what `parts` should have been, in words and with an example', () => {
    const message = errorAt(refusal('module', AUDIT_PAYLOAD), 'data.parts').message
    expect(message).toContain('data.parts must be a list of ModulePart objects, each {id, name, items}')
    expect(message).toContain('but it is the string "should be an array"')
    expect(message).toContain('A correct value looks like:')
    // The example in the message has to be usable as-is, not a shape sketch.
    expect(message).toContain('"state":"done"')
  })

  it('tells a caller with an unrecognisable key what the kind does take', () => {
    const message = errorAt(refusal('module', AUDIT_PAYLOAD), 'data.bogusField').message
    expect(message).toContain('unknown key "bogusField"')
    // `claims` was on this list from the arrival of the source index until window B, which emptied
    // the key into `implementation_map` and took the field off the kind in the same commit — so the
    // words here lost one, and a caller writing `claims` now gets the sentence naming the row
    // instead. `consequence` and `paused` joined it
    // when a record gained a way to say who is hurt if it is left alone and whether it was put
    // down on purpose. `state` joined it when a module gained a lifecycle word — active, paused,
    // stable, retired — so that 26 of 27 modules stopped landing in "nobody wrote a state here".
    // `shortForms` joined it on 19 August 2026, when a module gained shorter forms of its curated
    // summary for the surfaces that have no room for the whole thing. It MOVED TO THE END of the
    // list on 5 September 2026, when every kind gained it: the field is added to every kind at once,
    // below `KIND_SPECS`, so it is the last field on every kind rather than one typed into the
    // middle of two of them. `planner` and `planning` joined it on 11 October 2026 (wave 13j round
    // 49b), when a module gained the planning flow of a decision: who plans its work, and
    // where the office has that plan. `owner` joined it on 13 November 2026 (wave 13u round 216,
    // package BV), when a module gained a field naming the line that owns it.
    // The list is spelled out rather than computed on purpose — a caller reads these words, so a
    // field added silently is a field the message would go on not mentioning. THIS LINE IS EDITED
    // WHENEVER A KIND GAINS A FIELD, and that is what it is for: it went red for `shortForms`, which
    // is the message doing its job rather than the feature being wrong.
    expect(message).toContain(
      'context, state, parts, paths, summary, summaryBlocks, zh, neutral, onlyThisOffice, planner, planning, owner, consequence, paused, source, extra, shortForms',
    )
    expect(message).toContain('"extra"')
  })
})

describe('the bug that mattered more: data.blocks instead of data.summaryBlocks', () => {
  it('refuses `blocks` on a module and names summaryBlocks in the message', () => {
    const errors = refusal('module', {
      context: 'why this exists',
      parts: [],
      blocks: [{ id: 'b1', type: 'text', text: 'a paragraph nobody would ever have seen' }],
    })
    const message = errorAt(errors, 'data.blocks').message
    expect(message).toContain('unknown key "blocks"')
    expect(message).toContain('summaryBlocks')
  })

  it('accepts the spelling Mole Office actually reads', () => {
    accept('module', {
      context: 'why this exists',
      parts: [],
      summaryBlocks: [{ id: 'b1', type: 'text', text: 'a paragraph that will be drawn' }],
    })
  })

  it('corrects the two spellings an agent reaches for', () => {
    expect(suggestKey('summary_blocks', ['summaryBlocks', 'summary'])).toBe('summaryBlocks')
    expect(suggestKey('summaryblocks', ['summaryBlocks', 'summary'])).toBe('summaryBlocks')
  })
})

// ================================================================ the wrong keys the schema names

/**
 * The keys a field's own description calls out as wrong, read OUT OF that description.
 *
 * Taking them from the prose rather than repeating them here is the point of the test: the
 * schema is served over HTTP as documentation, so a key it warns about and a key the checker
 * knows about have to be the same list, and this fails if either side is edited alone.
 */
function namedWrongKeys(kind: RecordKind, key: string): string[] {
  const field = KIND_SPECS[kind].fields.find((f) => f.key === key)
  if (field === undefined) throw new Error(`there is no ${kind}.${key} field to read a description from`)
  const quoted = [...field.description.matchAll(/`([A-Za-z_]+)`/g)].map((m) => m[1] as string)
  const wrong = [...new Set(quoted)].filter((named) => named !== key && !DECLARED_KEYS.has(named))
  if (wrong.length === 0) throw new Error(`${kind}.${key} names no wrong keys, so this test would prove nothing`)
  return wrong
}

/**
 * Every key any kind or any nested shape declares.
 *
 * A description backticks two different sorts of word, and this is what tells them apart: a WRONG
 * key it is warning about (`blocks`, `charts`, `steps`), and a REAL field it is pointing at.
 */
const DECLARED_KEYS = new Set<string>([
  ...Object.values(KIND_SPECS).flatMap((spec) => spec.fields.map((f) => f.key)),
  ...Object.values(SHAPE_SPECS).flatMap((shape) => shape.fields.map((f) => f.key)),
])

describe('a key the schema warns about', () => {
  const WARNED: readonly (readonly [RecordKind, string])[] = [
    ['module', 'summaryBlocks'],
    ['pipeline', 'blockIds'],
  ]

  it('is refused, and the message names the field that was actually meant', () => {
    // The probe: POST module {"charts":[]} answered 'did you mean "parts"?'. `charts` is a
    // correctly spelt word two edits from `parts`, so pure string distance sends somebody who
    // wrote a chart to the progress checklist — while the field they wanted names `charts` as
    // a wrong key in its own description. A schema that warns about a key and then misdirects
    // the person who used it is worse than one that says nothing.
    for (const [kind, key] of WARNED) {
      for (const wrong of namedWrongKeys(kind, key)) {
        const message = errorAt(refusal(kind, { [wrong]: [] }), `data.${wrong}`).message
        expect(message, `${kind} data.${wrong}`).toBe(`unknown key "${wrong}" — did you mean "${key}"?`)
      }
    }
  })

  it('is described by what happens now, not by what happened before it was refused', () => {
    // These two descriptions used to say a mis-keyed chart was "stored, drawn as nothing" and a
    // mis-keyed pipeline "draws as an empty panel and reports no error". Both were true of a
    // build that no longer exists: the write is a 400 and nothing reaches the database. Stale
    // prose in a schema an agent cannot check against the source is worse than no prose.
    for (const [kind, key] of WARNED) {
      const description = KIND_SPECS[kind].fields.find((f) => f.key === key)?.description ?? ''
      expect(description, `${kind}.${key}`).toContain('refused')
      expect(description, `${kind}.${key}`).toContain('nothing is stored')
    }
  })

  it('is not promised anywhere in the schema to survive the write', () => {
    // The same sentence had been copied to a third place (ChartBlock). Sweeping every
    // description is cheaper than remembering how many copies there were.
    const described = [
      ...Object.values(KIND_SPECS).flatMap((spec) => spec.fields.map((f) => [`${spec.kind}.${f.key}`, f.description] as const)),
      ...Object.values(SHAPE_SPECS).map((shape) => [shape.name, shape.description] as const),
      ...Object.values(SHAPE_SPECS).flatMap((shape) => shape.fields.map((f) => [`${shape.name}.${f.key}`, f.description] as const)),
    ]
    const stale = described
      .filter(([, text]) => /stored and never drawn|drawn as nothing|is stored, drawn|empty panel|reports no error/.test(text))
      .map(([where]) => where)
    expect(stale).toEqual([])
  })
})

// ============================================================================ a correct record

describe('a correct module record', () => {
  const GOOD_MODULE = {
    context: 'A close-up camera on the right jaw. The overhead camera loses sight of the hand exactly when the lane moves into the transplant, which is the moment that matters.',
    parts: [
      {
        id: 'mount',
        name: 'Mount design',
        items: [
          { id: 'mount-1', text: 'Print the wrist bracket', state: 'done', hours: 3 },
          { id: 'mount-2', text: 'Check clearance at full close', state: 'doing', note: 'may clip the gripper' },
        ],
      },
    ],
    paths: [{ id: 'calib', label: 'Calibration output', path: `${THE_TEST_FIXTURE_ROOT}/PROJECTS/x/docs`, kind: 'dir' }],
    summary: 'Printed and calibrated; the remaining risk is mechanical.',
    summaryBlocks: [
      { id: 'b-1', type: 'text', heading: 'What was measured', text: 'Grip force against commanded effort.' },
      {
        id: 'b-2',
        type: 'chart',
        spec: {
          kind: 'line',
          x: { label: 'effort' },
          y: { label: 'grip force', unit: 'N' },
          series: [{ id: 's1', name: 'v3 shell', points: [{ x: 12, y: 11.2 }, { x: 18, y: 19.4 }], state: 'done' }],
          annotations: [{ id: 'need', axis: 'y', value: 12, label: '12 N needed' }],
        },
        caption: 'Two prints, three efforts each.',
      },
      { id: 'b-3', type: 'math', tex: 'F \\ge \\frac{m g}{2 \\mu}' },
      {
        id: 'b-4',
        type: 'table',
        columns: [{ label: 'effort' }, { label: 'force (N)', align: 'right' }],
        rows: [{ cells: ['12', 11.2] }, { cells: ['15', 15.9], state: 'failed' }],
      },
      { id: 'b-5', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/PROJECTS/x/docs/grip.png`, alt: 'The gripper holding the cube' },
    ],
    extra: { rig: 'bench jig 2' },
  }

  it('is accepted, blocks and all', () => {
    accept('module', GOOD_MODULE)
  })

  it('comes back exactly as it went in — nothing is trimmed, defaulted or reordered', () => {
    const result = validateData('module', GOOD_MODULE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toBe(GOOD_MODULE)
    expect(JSON.stringify(result.data)).toBe(JSON.stringify(GOOD_MODULE))
  })
})

// ============================================================================ the fourteen kinds

describe('the specs themselves', () => {
  it('covers every record kind, and nothing that is not one', () => {
    expect(Object.keys(KIND_SPECS).sort()).toEqual([...RECORD_KINDS].sort())
    for (const kind of RECORD_KINDS) expect(KIND_SPECS[kind].kind).toBe(kind)
  })

  it('agrees with HUMAN_ONLY_KINDS about who may write what', () => {
    const humanOnly = RECORD_KINDS.filter((k) => KIND_SPECS[k].humanOnly)
    expect(humanOnly.sort()).toEqual([...HUMAN_ONLY_KINDS].sort())
  })

  it('says what every kind is for and when to file one', () => {
    for (const kind of RECORD_KINDS) {
      const spec = KIND_SPECS[kind]
      expect(spec.purpose.length, `${kind}.purpose`).toBeGreaterThan(20)
      expect(spec.whenToRecord.length, `${kind}.whenToRecord`).toBeGreaterThan(20)
      for (const field of spec.fields) {
        expect(field.description.length, `${kind}.${field.key}.description`).toBeGreaterThan(20)
      }
    }
  })

  it('gives every kind a complete example that its own checker accepts', () => {
    // This is the test that keeps the documentation honest. An example that does not validate is
    // an instruction to write an invalid record.
    for (const kind of RECORD_KINDS) accept(kind, KIND_SPECS[kind].example)
  })

  it('gives every field an example that matches the type declared beside it', () => {
    // Each field example is checked by putting it in a record of its kind on its own, which also
    // proves that every declared type string is one the checker can parse. Errors reported at
    // OTHER paths are the cross-field rules doing their job (a `cost` with no `currency`), not
    // the example being wrong, so only the field's own path is read.
    for (const kind of RECORD_KINDS) {
      const spec = KIND_SPECS[kind]
      const required = spec.fields.filter((f) => f.required)
      for (const field of spec.fields) {
        const data: Record<string, unknown> = { [field.key]: field.example }
        for (const r of required) if (!(r.key in data)) data[r.key] = r.example
        const result = validateData(kind, data)
        const own = result.ok ? [] : result.errors.filter((e) => e.path.startsWith(`data.${field.key}`))
        expect(own.map((e) => e.message), `${kind}.${field.key}`).toEqual([])
      }
    }
  })

  it('gives every nested shape an example of its own that its own checker accepts', () => {
    // A FIELD WHOSE EXAMPLE HOLDS ONLY BESIDE OTHER VALUES names them in `exampleWith`: a checklist item's mark that the
    // person did it is kept only while the item is done, and its `supersededBy` only while it is superseded, so no one
    // item holds both. Such a field is left out of the shape's whole example and checked in a whole example of its own:
    // the required fields, the field, and the values it names. So every field's example is still checked in a whole object.
    const buildExample = (fields: readonly FieldSpec[]): Record<string, unknown> => {
      const out: Record<string, unknown> = {}
      for (const f of fields) if (f.exampleWith === undefined) out[f.key] = f.example
      return out
    }
    const checkEachExampleWith = (name: string, fields: readonly FieldSpec[]): void => {
      for (const field of fields) {
        if (field.exampleWith === undefined) continue
        const named = Object.keys(field.exampleWith)
        expect(named.length, `${name}.${field.key} names no value in exampleWith`).toBeGreaterThan(0)
        for (const key of named) {
          expect(key !== field.key && fields.some((f) => f.key === key), `${name}.${field.key}'s exampleWith names "${key}", which is not another field of ${name}`).toBe(true)
        }
        const alone: Record<string, unknown> = {}
        for (const f of fields) if (f.required) alone[f.key] = f.example
        Object.assign(alone, { [field.key]: field.example }, field.exampleWith)
        const result = validateShape(name, alone)
        expect(result.ok ? [] : result.errors.map((e) => e.message), `${name}.${field.key} with ${JSON.stringify(field.exampleWith)}`).toEqual([])
      }
    }
    for (const [name, shape] of Object.entries(SHAPE_SPECS)) {
      if (shape.discriminator) {
        // A union has no fields of its own: every variant it can select must be a real shape,
        // and each one built from its own examples must validate through the union.
        for (const [tag, variant] of Object.entries(shape.discriminator.variants)) {
          const variantShape = SHAPE_SPECS[variant]
          expect(variantShape, `${name}.${tag} -> ${variant}`).toBeDefined()
          if (!variantShape) continue
          const result = validateShape(name, buildExample(variantShape.fields))
          expect(result.ok ? [] : result.errors.map((e) => e.message), `${name} as ${tag}`).toEqual([])
        }
        continue
      }
      const result = validateShape(name, buildExample(shape.fields))
      expect(result.ok ? [] : result.errors.map((e) => e.message), name).toEqual([])
      checkEachExampleWith(name, shape.fields)
    }
  })

  it('writes down every cross-field rule in English as well as in code', () => {
    // A rule enforced by a function nobody can read over HTTP is a rule an agent will break.
    expect(KIND_SPECS.purchase.rules?.join(' ')).toContain('currency')
    expect(KIND_SPECS.claim.rules?.join(' ')).toContain('retracted')
    expect(KIND_SPECS.direction.rules?.join(' ')).toContain('evidence')
    expect(KIND_SPECS.obligation.rules?.join(' ')).toContain('done')
    expect(KIND_SPECS.pipeline.rules?.join(' ')).toContain('blockIds')
  })

  it('does the same for a rule that lives on a nested shape rather than on a kind', () => {
    // Some rules belong to the SHAPE and not to the kind, because the same shape is declared on
    // eight kinds and eight copies of one sentence is the drift this project keeps finding. Those
    // are served at GET /api/kinds beside the shape's fields, so they are held to the same
    // standard: a sentence, not a type name.
    const withRules = Object.values(SHAPE_SPECS).filter((shape) => (shape.rules?.length ?? 0) > 0)
    // THREE SHAPES HAVE RULES. `StepNeed` was once one of them and its rule was about a gate; a gate
    // rides on a `blocks` link and nothing else since a block became a record, so that rule is
    // published on the link and enforced by `checkGate`. `Span` is the new one: a quoted span whose
    // `to` is before its `from` is a pair that cannot be true, and the rule is enforced HERE rather
    // than only on the agent-message write path, because an annotation's `context` arrives through
    // `validateData` and would otherwise miss it.
    //
    // `ShortForms` WAS ADDED ON 19 August 2026 and this line went red for it, which is the alarm
    // doing its job rather than the shape being wrong. Its two rules are the word budget for each of
    // the five lengths and the refusal of any form made by cutting a longer one. They are published
    // here for the same reason the other two are: a caller who cannot read the source is told the
    // rule they were refused for.
    //
    // `ShortFormsWithParts` JOINED IT ON 5 September 2026, when every kind gained a place for a
    // level-1 name and the shape split in two: the kinds that hold blocks carry the by-part levels
    // and the rest do not. Both shapes publish the same two rules, from one list, because they are
    // one shape with and without `parts`.
    //
    // `FlowRunStep` JOINED ON 4 October 2026 (wave 13p round 25): a step of a run's flow run done by hand says why, and
    // a caller of the hand-step door is told that rule when refused for it.
    //
    // `MessageLabel` JOINED ON 15 November 2026, when a person's message could carry a label of the person's own. Its one
    // rule is the shape of the label's word: not empty, on one line, no space at its start or end, and no longer than the
    // longest label allowed. It is published here so that a caller refused for a label is told the rule it broke.
    //
    // `MarkedPart` JOINED ON 18 November 2026, when a person could mark runs of a message's own words, each with its own
    // flag. Its four rules say that a part is a run inside the message's words that its quote copies exactly, starts and
    // ends on a character a person can see, carries exactly one flag that asks something, and shares no character with
    // another part. They are published here so that a caller refused for a part is told the rule it broke.
    expect(withRules.map((shape) => shape.name).sort()).toEqual([
      'FlowRunStep',
      'MarkedPart',
      'MessageLabel',
      'PauseUntil',
      'ShortForms',
      'ShortFormsWithParts',
      'Span',
      // OLD: no first handoff shapes. NEW: each declared strict shape publishes its rule.
      // WHY: callers must discover the original pin, prepared scope, digest and event constraints.
      'StableBootstrapAnnouncement',
      'StableBootstrapApprovedWords',
      'StableBootstrapAuthorityReference',
      // OLD: 'StableBootstrapStopScope' carried the handoff's rule. NEW: that name chooses between two
      // acts by `action`, and the handoff's own shape, with the same rule, is 'StableBootstrapHandoffStopScope'.
      // WHY: a decision may now cover the move of the data folder as well, so the stop scope has two shapes.
      'StableBootstrapHandoffStopScope',
      'StableBootstrapPrepared',
      'StableNoticeApproval',
      'StableNoticeOriginal',
      'StableNoticeServing',
      'StableOfficeNoticeEvent',
    ])
    for (const shape of withRules) {
      for (const rule of shape.rules ?? []) expect(rule.length, `${shape.name} rule`).toBeGreaterThan(40)
    }
  })

  it('runs a shape rule only once that shape\'s own keys are sound', () => {
    // The same ordering as the per-kind rules, for the same reason: a rule about what should end a
    // pause has nothing useful to say while `since` is a number, and saying it anyway buries the
    // error that matters. Only the `since` fault is reported here.
    const errors = refusal('task', { paused: { since: 7, why: 'the bench is in pieces' } })
    expect(errors.map((e) => e.path)).toEqual(['data.paused.since'])
  })
})

// ============================================================================ required fields

describe('a required field that is absent: stored, and reported', () => {
  it('stores a record created with no data at all, and says what it can never do until it is filled in', () => {
    // The audit found POST {"kind":"obligation","title":"probe"} returning 201 in silence,
    // storing an obligation that can never come due. The fix is not to refuse it — an obligation
    // you have not dated yet is still a real obligation somebody owes — it is to say so, on
    // every read, until the date is there. Both spellings of "no data" behave the same.
    for (const data of [undefined, null, {}]) {
      const gap = one(missing('obligation', data), `incompleteness for obligation ${JSON.stringify(data)}`)
      expect(gap.path).toBe('data.due')
      expect(gap.message).toContain('data.due is not filled in, so this obligation is incomplete')
      expect(gap.message).toContain('can never come due')
      expect(gap.message).toContain('2026-08-14')
    }
  })

  it('reports a session with no state, a pipeline with no steps, a direction with no depth', () => {
    expect(missingPaths('session', {})).toEqual(['data.state'])
    expect(missingPaths('pipeline', {})).toEqual(['data.blockIds'])
    expect(missingPaths('direction', {})).toEqual(['data.depth'])
    expect(missingPaths('message', {})).toEqual(['data.body'])
  })

  it('leaves the kinds nothing reads at their author\'s discretion', () => {
    // `required` is reserved for what Mole Office cannot draw without. A note with only a title is a
    // real note — not merely accepted, but COMPLETE, with nothing outstanding to report.
    for (const kind of ['note', 'task', 'idea', 'claim', 'problem', 'purchase', 'wanna_try', 'decision'] as const) {
      accept(kind, {})
      expect(missing(kind, {}), kind).toEqual([])
    }
  })

  it('still refuses everything that is WRONG rather than unfinished', () => {
    // The line this phase draws, in one test. Absence is the only thing that moved.
    expect(refusal('module', { contxet: 'typo' })).toHaveLength(1) // an unknown key
    expect(refusal('module', { parts: 'a string' })).toHaveLength(1) // a wrong type
    expect(refusal('session', { state: 'finished-ish' })).toHaveLength(1) // outside the vocabulary
    expect(refusal('module', { parts: [{ id: 'p1', items: [] }] })).toHaveLength(1) // half a part
  })

  it('does not accept an empty string in place of a value', () => {
    const message = errorAt(refusal('session', { state: 'running', runtime: '' }), 'data.runtime').message
    expect(message).toContain('an empty string')
    expect(message).toContain('leave the key out instead')
  })

  it('refuses null rather than treating it as absent', () => {
    // Absent is a decision not to write something yet. `null` is a decision to STORE a value
    // nothing can read, which is the shape of missing that arrives by mistake.
    const message = errorAt(refusal('module', { context: null, parts: [] }), 'data.context').message
    expect(message).toContain('but it is null')
    expect(message).toContain('Leave the key out entirely')
  })

  it('takes null only in a field declared `string | null`, and still refuses a blank or a wrong value there', () => {
    // THE THREE FIELDS WHERE THE OFFICE STORES A NULL THAT IS AN ANSWER (the scoped check iasdX1oUKtfh): the effort it
    // answers a launcher, null when it answers none, and the process row found when a launcher ended, null when none was
    // open. Each is built from its shape's own examples with the one field changed.
    const errorsOf = (shape: string, value: unknown): ValidationError[] => {
      const result = validateShape(shape, value)
      return result.ok ? [] : result.errors
    }
    const withOne = (shape: string, key: string, value: unknown): Record<string, unknown> => ({
      ...Object.fromEntries(SHAPE_SPECS[shape]!.fields.map((field) => [field.key, field.example])),
      [key]: value,
    })
    for (const [shape, key] of [['NextRoundStarting', 'effort'], ['WorkerRunStarting', 'effort'], ['NextRoundProcess', 'row']] as const) {
      expect(errorsOf(shape, withOne(shape, key, null)), `${shape}.${key} null`).toEqual([])
      expect(errorsOf(shape, withOne(shape, key, 'a value')), `${shape}.${key} a string`).toEqual([])
      expect(errorAt(errorsOf(shape, withOne(shape, key, '')), `value.${key}`).message).toContain('leave the key out instead')
      expect(errorAt(errorsOf(shape, withOne(shape, key, 5)), `value.${key}`).message).toContain(`value.${key} must be a non-empty string, or null, but it is the number 5.`)
    }
    // THE FIELD BESIDE ONE STILL REFUSES NULL: the null is declared field by field, not taken everywhere.
    const says = errorAt(errorsOf('NextRoundProcess', withOne('NextRoundProcess', 'says', null)), 'value.says').message
    expect(says).toContain('but it is null')
    expect(says).toContain('Leave the key out entirely')
  })
})

// ==================================================================== stub, then enriched

describe('a module is created as a stub and filled in later — the progression', () => {
  // This is the natural way every caller in this codebase creates a record:
  // createRecord({ kind: 'module', title: 'Close-up camera' }) — no data at all, because at the
  // moment work starts nobody knows the checklist yet. Twenty-two tests wrote it that way
  // before anyone wrote a spec, which is the strongest evidence available about what the
  // schema should have said.
  const CONTEXT = 'A close-up camera on the right jaw. The overhead camera loses sight of the hand exactly when the lane moves into the transplant, which is the moment that matters.'
  const PARTS = [{ id: 'mount', name: 'Mount design', items: [{ id: 'mount-1', text: 'Print the bracket', state: 'done' }] }]

  it('is created with only a title, and reports the two things it still wants', () => {
    expect(missingPaths('module', {})).toEqual(['data.context', 'data.parts'])
  })

  it('reports one after a PATCH that adds the context', () => {
    expect(missingPaths('module', { context: CONTEXT })).toEqual(['data.parts'])
  })

  it('reports none after a PATCH that adds the parts', () => {
    expect(missing('module', { context: CONTEXT, parts: PARTS })).toEqual([])
  })

  it('counts an empty checklist as an answer, because the field says to send one', () => {
    // `parts: []` is what the description tells a caller to write when there is nothing on the
    // checklist yet. A completeness check that then nagged about it would be arguing with the
    // documentation the same caller was told to read.
    expect(missing('module', { context: CONTEXT, parts: [] })).toEqual([])
  })

  it('says what is missing and why it matters, not "context is required"', () => {
    const gap = one(missing('module', { parts: [] }), 'incompleteness for a module with no context')
    expect(gap.path).toBe('data.context')
    // what is missing, and that the record still exists
    expect(gap.message).toContain('data.context is not filled in, so this module is incomplete')
    // why it matters, in the words of the field's own description
    expect(gap.message).toContain('the first thing on the module page')
    // WHAT TO DO ABOUT IT, WITHOUT NAMING A MECHANISM. It said "send this in a PATCH", which was
    // right for the agent reading it over the API and wrong for the person reading the same
    // sentence on the record page — where there is now a box, three inches below, that writes the
    // field. One message, two readers, and neither is told the other's way in.
    expect(gap.message).toContain('fill it in when you know it')
    expect(gap.message, 'a human reading this on the page has a control, not a request to make').not.toContain('PATCH')
    expect(gap.message).toContain('A second camera on the right jaw')
    // and not the sentence that tells the author nothing they did not know
    expect(gap.message).not.toContain('is required')
  })

  it('reports in the order the fields are declared, so the list reads the way the page does', () => {
    expect(missingPaths('module', {})).toEqual(['data.context', 'data.parts'])
    expect(missingPaths('module', { parts: [] })).toEqual(['data.context'])
  })
})

// ============================================================== completeness on the read path

describe('completenessOf: computed on read, and never able to take a page down', () => {
  it('gives the same answer as the write path for the same data', () => {
    for (const data of [{}, { context: 'why' }, { context: 'why', parts: [] }]) {
      expect(completenessOf('module', data)).toEqual(missing('module', data))
    }
  })

  it('never throws, whatever is in the record', () => {
    // Every one of these can come off disk: records were written for two months with no gate at
    // all. A read path that threw would take out the whole page rather than the one bad record,
    // and the page is where somebody would have noticed and fixed it.
    const junk: unknown[] = [
      undefined,
      null,
      'a string where an object should be',
      42,
      [],
      [{ id: 'p1' }],
      { context: null, parts: null },
      { context: '   ', parts: [] },
      { contxet: 'the typo, stored before anything checked' },
      { context: 'why', parts: 'a string' },
    ]
    for (const data of junk) {
      expect(() => completenessOf('module', data), JSON.stringify(data) ?? 'undefined').not.toThrow()
    }
  })

  it('counts a stored null or blank string as not filled in, because that is what the page shows', () => {
    // Both are refused on the way in now, so only an old record can hold one. Reporting it as
    // present would be reporting a lie about a record the reader is looking straight at.
    expect(completenessOf('module', { context: null, parts: [] }).map((i) => i.path)).toEqual(['data.context'])
    expect(completenessOf('module', { context: '   ', parts: [] }).map((i) => i.path)).toEqual(['data.context'])
  })

  it('says so plainly when data is not an object at all', () => {
    const gap = one(completenessOf('module', 'a string'), 'incompleteness for a module whose data is a string')
    expect(gap.path).toBe('data')
    expect(gap.message).toContain('rather than an object')
    expect(gap.message).toContain('none of the fields a module takes can be read off it')
  })

  it('reports rather than hides a record of a kind Mole Office does not know', () => {
    const gap = one(completenessOf('spreadsheet' as RecordKind, {}), 'incompleteness for an unknown kind')
    expect(gap.path).toBe('kind')
    expect(gap.message).toContain('not one Mole Office knows')
    // `block` sits between `pipeline` and `session` in RECORD_KINDS, which is where a step of a
    // pipeline belongs in a list a reader scans.
    expect(gap.message).toContain('module, pipeline, block, session')
  })

  it('has nothing to say about a kind with no required fields', () => {
    expect(completenessOf('note', { body: 'anything' })).toEqual([])
    expect(completenessOf('note', {})).toEqual([])
  })

  it('is derived from the specs, so it cannot go stale: every kind agrees with its own spec', () => {
    // The check that would have caught a stored flag: for each kind, what completenessOf reports
    // on an empty record is exactly the set of fields the spec marks required. Add a required
    // field tomorrow and every existing record starts reporting it, with no migration.
    for (const kind of RECORD_KINDS) {
      const required = KIND_SPECS[kind].fields.filter((f) => f.required).map((f) => `data.${f.key}`)
      expect(completenessOf(kind, {}).map((i) => i.path), kind).toEqual(required)
      expect(completenessOf(kind, KIND_SPECS[kind].example), `${kind} example`).toEqual([])
    }
  })
})

// ============================================================================ nested paths

describe('errors point at the exact place', () => {
  const moduleWith = (parts: unknown) => ({ context: 'why this exists', parts })

  it('names the part and the item, not just "parts"', () => {
    const errors = refusal(
      'module',
      moduleWith([{ id: 'p1', name: 'Mount', items: [{ id: 'i1', text: 'Print it', state: 'nearly' }] }]),
    )
    const message = errorAt(errors, 'data.parts[0].items[0].state').message
    expect(message).toContain('one of: todo, doing, done, failed, blocked')
    expect(message).toContain('the string "nearly"')
  })

  it('catches a typo inside a nested object, three levels down', () => {
    const errors = refusal(
      'module',
      moduleWith([{ id: 'p1', name: 'Mount', items: [{ id: 'i1', text: 'Print it', state: 'done', stat: 'done' }] }]),
    )
    expect(errorAt(errors, 'data.parts[0].items[0].stat').message).toBe('unknown key "stat" — did you mean "state"?')
  })

  it('reports a missing required field inside a list entry', () => {
    const errors = refusal('module', moduleWith([{ id: 'p1', items: [] }]))
    expect(errorAt(errors, 'data.parts[0].name').message).toContain('data.parts[0].name is required')
  })

  it('reports every bad entry of a list, not only the first', () => {
    const errors = refusal('module', {
      context: 'c',
      parts: [
        { id: 'p1', name: 'one', items: [] },
        { id: 'p2', items: [] },
        { id: 'p3', name: 'three', items: 'not a list' },
      ],
    })
    expect(errors.map((e) => e.path)).toEqual(['data.parts[1].name', 'data.parts[2].items'])
  })
})

// ============================================================================ summary blocks

describe('curated summary blocks', () => {
  const moduleWithBlocks = (summaryBlocks: unknown) => ({ context: 'why', parts: [], summaryBlocks })

  it('names every block type there is when the type is not one of them', () => {
    const errors = refusal('module', moduleWithBlocks([{ id: 'b1', type: 'hologram', text: 'x' }]))
    const message = errorAt(errors, 'data.summaryBlocks[0].type').message
    expect(message).toContain(`one of: ${SUMMARY_BLOCK_TYPES.join(', ')}`)
    expect(message).toContain('decides what the rest of the object has to contain')
  })

  it('checks the block the type selected, and no other', () => {
    // A chart block missing its spec must complain about `spec`, not about `text`.
    const errors = refusal('module', moduleWithBlocks([{ id: 'b1', type: 'chart' }]))
    expect(errors.map((e) => e.path)).toEqual(['data.summaryBlocks[0].spec'])
  })

  it('reaches into a chart spec', () => {
    const errors = refusal(
      'module',
      moduleWithBlocks([
        { id: 'b1', type: 'chart', spec: { kind: 'line', x: { label: 'effort' }, y: {}, series: [] } },
      ]),
    )
    expect(errorAt(errors, 'data.summaryBlocks[0].spec.y.label').message).toContain('is required')
  })

  it('keeps "not measured" as a string in a table cell', () => {
    accept(
      'module',
      moduleWithBlocks([
        {
          id: 'b1',
          type: 'table',
          columns: [{ label: 'effort' }, { label: 'force' }],
          rows: [{ cells: ['18', 'not measured'] }],
        },
      ]),
    )
  })

  it('agrees with the block types the renderer and the seed already use', () => {
    const variants = SHAPE_SPECS.SummaryBlock?.discriminator?.variants ?? {}
    expect(Object.keys(variants)).toEqual([...SUMMARY_BLOCK_TYPES])
  })
})

// ============================================================================ dates

describe('dates', () => {
  it('accepts the forms the rest of Mole Office can read', () => {
    for (const due of ['2026-08-14', '2026-08-14 17:00', '2026-08-14 17:00:00', '2026-08-14T17:00:00']) {
      accept('obligation', { due })
    }
  })

  it('refuses a date nothing can read, and says what to write instead', () => {
    const message = errorAt(refusal('obligation', { due: 'after the demo' }), 'data.due').message
    expect(message).toContain('not a date Mole Office can read')
    expect(message).toContain('2026-08-14')
    expect(message).toContain('END of that day')
  })

  it('refuses a day that does not exist rather than sliding it into next month', () => {
    // "2026-02-31" parses as 3 March in JavaScript. An obligation quietly due three days late is
    // worse than a refused write.
    expect(refusal('obligation', { due: '2026-02-31' })).toHaveLength(1)
    expect(refusal('obligation', { due: '2026-13-01' })).toHaveLength(1)
    expect(refusal('obligation', { due: '2026-08-14 25:00' })).toHaveLength(1)
  })
})

// ============================================================================ cross-field rules

describe('rules that need two fields', () => {
  it('refuses a price with no currency', () => {
    expect(errorAt(refusal('purchase', { cost: 240 }), 'data.currency').message).toContain('a bare number is not a price')
    expect(errorAt(refusal('purchase', { currency: 'GBP' }), 'data.cost').message).toContain('data.cost is needed')
    accept('purchase', { cost: 240, currency: 'GBP' })
  })

  it('refuses a retracted claim that still calls itself measured', () => {
    const errors = refusal('claim', { state: 'measured', retracted_because: 'a static hold is not a handover pull' })
    expect(errorAt(errors, 'data.state').message).toContain('must be "retracted"')
    accept('claim', { state: 'retracted', retracted_because: 'a static hold is not a handover pull' })
  })

  it('refuses a retraction that leaves the claim unmarked, not just one marked wrongly', () => {
    // The rule only fired when `state` was present and wrong, so a withdrawal sent on its own
    // was stored and reported complete. That is the worse half of the two: the reason the claim
    // was withdrawn sits in a field nobody reads while every panel and every link goes on
    // treating the claim as live. The record then looks handled, which is why absence is a
    // refusal here rather than an incompleteness to fill in later.
    const message = errorAt(refusal('claim', { retracted_because: 'a static hold is not a handover pull' }), 'data.state').message
    expect(message).toContain('data.state is not set at all')
    expect(message).toContain('send data.state: "retracted"')
    expect(message).toContain('still reading as sound')

    // Every state that is not "retracted" is refused, absence included; only "retracted" passes.
    for (const state of CLAIM_STATES) {
      const data = { state, retracted_because: 'a static hold is not a handover pull' }
      if (state === 'retracted') accept('claim', data)
      else refusal('claim', data)
    }
  })

  it('refuses a direction that claims a measurement with nothing behind it', () => {
    const message = errorAt(refusal('direction', { depth: 'measured' }), 'data.evidence').message
    expect(message).toContain('data.evidence is required')
    expect(message).toContain('the honest depth is "ran"')
    accept('direction', { depth: 'ran' })
    accept('direction', { depth: 'measured', evidence: ['240 replays, mean error 33 mm'] })
  })

  it('counts an empty evidence list as nothing behind it, which is what the rule is for', () => {
    // Presence was checked and emptiness was not, so `{"depth":"defended","evidence":[]}` was
    // stored and reported complete — an empty list being the plainest way there is to say
    // nothing was observed, on the rung that claims the most.
    const message = errorAt(refusal('direction', { depth: 'defended', evidence: [] }), 'data.evidence').message
    expect(message).toContain('an empty list is not evidence')
    expect(message).toContain('the honest depth is "ran"')
    for (const depth of DIRECTION_DEPTHS) {
      const deep = depth === 'measured' || depth === 'integrated' || depth === 'defended'
      // A shallow rung claims no measurement, so it may say out loud that it observed nothing.
      if (deep) refusal('direction', { depth, evidence: [] })
      else accept('direction', { depth, evidence: [] })
    }
  })

  it('only runs the cross-field rules once the fields themselves are sound', () => {
    // While `cost` is a string there is nothing useful to say about `currency`, and saying it
    // anyway buries the error that matters.
    const errors = refusal('purchase', { cost: 'two hundred' })
    expect(errors.map((e) => e.path)).toEqual(['data.cost'])
  })
})

// ============================================================================ the depth ladder

describe('a direction has a depth, and the depth is a rung of the ladder', () => {
  it('takes the six levels and nothing else', () => {
    for (const depth of DIRECTION_DEPTHS) {
      const deep = depth === 'measured' || depth === 'integrated' || depth === 'defended'
      accept('direction', deep ? { depth, evidence: ['measured it'] } : { depth })
    }
    const message = errorAt(refusal('direction', { depth: 2 }), 'data.depth').message
    expect(message).toContain('one of: noticed, read, ran, measured, integrated, defended')
    expect(message).toContain('the number 2')
  })

  it('explains what each rung claims, for someone who has never seen the ladder', () => {
    const description = KIND_SPECS.direction.fields.find((f) => f.key === 'depth')?.description ?? ''
    for (const depth of DIRECTION_DEPTHS) expect(description).toContain(`${depth}:`)
  })
})

// ============================================================================ pipelines

describe('a pipeline stores an ordered list of block record ids', () => {
  it('accepts `blockIds`, and sends both old spellings to it', () => {
    accept('pipeline', { blockIds: ['hv2-01', 'hv2-02'] })
    // TWO WRONG KEYS, BOTH ANSWERED. `steps` is what every pipeline in this product stored until
    // today, so an agent that learnt Mole Office last week will send it; `blocks` is what the design
    // notes always called a step. Both are the same mistake and both get the same answer.
    expect(errorAt(refusal('pipeline', { steps: [] }), 'data.steps').message).toBe(
      'unknown key "steps" — did you mean "blockIds"?',
    )
    expect(errorAt(refusal('pipeline', { blocks: [] }), 'data.blocks').message).toBe(
      'unknown key "blocks" — did you mean "blockIds"?',
    )

    // The fallback listing is still there for a key nothing can be inferred from. `context` joined it
    // on 13 November 2026 (wave 13u round 216, package BV), when a pipeline gained a body of its own,
    // longer than its summary.
    const unknown = errorAt(refusal('pipeline', { bogusField: [] }), 'data.bogusField').message
    expect(unknown).toContain('It takes: blockIds, dependenciesComplete, context, consequence, paused, source, extra')
  })

  it('has no nested step type left for a second definition to drift from', () => {
    // `PipelineStep`, `StepNeed` and the `PipelineBlock` alias are all gone from the contract. The
    // stored shape of a block is `BlockData`, and the reading of one is `PipelineBlockView` in
    // shared/blocks.ts — derived, never stored, and the only reading there is.
    const data: BlockData = { state: 'done', measured: '11.2 N over n=5' }
    expect(data.state).toBe('done')
  })
})

// ============================================================================ shared vocabulary

describe('one vocabulary, not several', () => {
  it('keeps the session states in shared/types.ts equal to the ones the alarm panel reads', () => {
    // A state the panel does not have is a session it refuses to rank, which is how adding
    // `orphaned` and `unknown` once left the alarm panel behind.
    expect([...SESSION_STATES]).toEqual([...ATTENTION_SESSION_STATES])
  })

  it('has the alarm panel re-export that list rather than keep a second copy of it', () => {
    // Identity, not equality: the fix for the drift above was to delete attention.ts's own copy
    // and re-export this one. A new copy that happened to be correct on the day it was written
    // would pass the test above and fail here, which is the point — the copy is the defect, not
    // the disagreement, and the disagreement only arrives months later.
    expect(ATTENTION_SESSION_STATES).toBe(SESSION_STATES)
  })

  it('offers the session states as the type an agent reads', () => {
    const field = KIND_SPECS.session.fields.find((f) => f.key === 'state')
    expect(field?.type).toBe(SESSION_STATES.map((s) => `'${s}'`).join(' | '))
  })
})

// ============================================================================ did you mean

// ============================================================================ the server gate

describe('the gate on the write path', () => {
  // validate.ts reaches summary.ts and through it records.ts, which opens SQLite the moment it
  // is imported. freshDb points that at a throwaway file before the import happens.
  let t: TestDb
  let gate: typeof import('../src/server/lib/validate.ts')

  beforeAll(async () => {
    t = await freshDb()
    gate = await import('../src/server/lib/validate.ts')
  })
  afterAll(() => t.close())

  const refuse = (kind: RecordKind, data: unknown): Error =>
    expectPanelError(t, () => gate.validateRecordData(kind, data), 400)

  it('turns the audit payload into a 400 that lists every fault at once', () => {
    const message = refuse('module', { contxet: 'typo key', parts: 'should be an array', bogusField: 123 }).message
    expect(message).toContain('This module record was not stored, because 3 fields are wrong:')
    expect(message).toContain('unknown key "contxet" — did you mean "context"?')
    expect(message).toContain('data.parts must be a list of ModulePart objects')
    expect(message).toContain('unknown key "bogusField"')
    // Not a fourth line about the absent `context`: nothing was stored, so there is nothing to
    // be incomplete, and a refusal that mixes "you spelt this wrong" with "you have not written
    // this yet" invites a caller to fix the wrong half.
    expect(message).not.toContain('data.context')
    // The way out, for a caller who cannot read this source.
    expect(message).toContain('GET /api/kinds/module')
  })

  it('reports every table-block fault when its discriminator is written as kind', () => {
    const message = refuse('report', {
      for: 'the reviewer',
      date: '2026-09-25',
      blocks: [{ kind: 'table', id: 'b-table', columns: [{}], rows: [{}] }],
    }).message
    const lines = message.split('\n')
    const schemaLine = lines.findIndex((line) => line.includes('GET /api/kinds/report'))

    expect(message).toContain('data.blocks[0].type')
    expect(message).toContain('data.blocks[0].columns[0].label')
    expect(message).toContain('data.blocks[0].rows[0].cells')
    expect(message).toContain('unknown key "kind"')
    expect(schemaLine, 'the report schema link belongs on the first error').toBe(1)
    expect(lines[schemaLine]).toContain('data.blocks[0].type')
  })

  it('refuses a block whose type or kind names a key every object inherits', () => {
    // "constructor" is a key of every plain object, but it is not a block type.
    for (const block of [
      { type: 'constructor', id: 'b-1', text: 'x' },
      { kind: 'constructor', id: 'b-1', text: 'x' },
    ]) {
      const message = refuse('report', { for: 'the reviewer', date: '2026-09-25', blocks: [block] }).message
      expect(message).toContain('data.blocks[0].type must be one of: text,')
    }
  })

  it('stores a stub and hands back what it is missing, instead of refusing it', () => {
    // The same progression as above, through the gate the write path actually calls.
    expect(gate.validateRecordData('module', {}).map((i) => i.path)).toEqual(['data.context', 'data.parts'])
    expect(gate.validateRecordData('module', { context: 'A close-up camera on the right jaw.' }).map((i) => i.path)).toEqual([
      'data.parts',
    ])
    expect(gate.validateRecordData('module', { context: 'A close-up camera on the right jaw.', parts: [] })).toEqual([])
  })

  it('lets a correct record through, including its blocks', () => {
    gate.validateRecordData('module', {
      context: 'A close-up camera on the right jaw.',
      parts: [{ id: 'p', name: 'Mount', items: [{ id: 'i', text: 'Print it', state: 'done' }] }],
      summaryBlocks: [
        {
          id: 'b',
          type: 'chart',
          spec: {
            kind: 'line',
            x: { label: 'effort' },
            y: { label: 'grip force', unit: 'N' },
            series: [{ id: 's', name: 'v3', points: [{ x: 12, y: 11.2 }] }],
          },
        },
      ],
    })
  })

  it('also applies the block RULES, which are a layer the structure check cannot see', () => {
    // Structurally this is a chart: `series` is a list of ChartSeries. It is still not a chart
    // anybody can read, and summary.ts is the file that knows why.
    const empty = refuse('module', {
      context: 'why',
      parts: [],
      summaryBlocks: [{ id: 'b', type: 'chart', spec: { kind: 'line', x: { label: 'x' }, y: { label: 'y' }, series: [] } }],
    })
    expect(empty.message).toContain('at least one series')

    // Same again: a row one cell short is the right shape and the wrong table.
    const short = refuse('module', {
      context: 'why',
      parts: [],
      summaryBlocks: [
        { id: 'b', type: 'table', columns: [{ label: 'effort' }, { label: 'force' }], rows: [{ cells: ['12'] }] },
      ],
    })
    expect(short.message).toContain('1 cell but the table has 2 columns')
  })

  it('reports the structure first, so a caller is never told about a rule on an object that is the wrong shape', () => {
    const message = refuse('module', { context: 'why', parts: [], summaryBlocks: 'a paragraph' }).message
    expect(message).toContain('data.summaryBlocks must be a list of SummaryBlock objects')
    expect(message).not.toContain('curated summary is not usable')
  })

  it('accepts a record that arrives with no data at all, and reports it rather than refusing it', () => {
    const gaps = gate.validateRecordData('obligation', undefined)
    expect(gaps.map((i) => i.path)).toEqual(['data.due'])
    expect(one(gaps, 'the obligation incompleteness').message).toContain('can never come due')
  })

  it('still throws on a block that breaks the rules even while the record is incomplete', () => {
    // The two halves are independent: a module with no context is fine, and a chart with no
    // series inside that same module is not. Being unfinished is not a licence to store a
    // summary block that will draw as an empty frame.
    const empty = refuse('module', {
      summaryBlocks: [{ id: 'b', type: 'chart', spec: { kind: 'line', x: { label: 'x' }, y: { label: 'y' }, series: [] } }],
    })
    expect(empty.message).toContain('at least one series')
  })
})

describe('did-you-mean', () => {
  it('suggests a near miss', () => {
    expect(suggestKey('contxet', ['context', 'parts'])).toBe('context')
    expect(suggestKey('blockids', ['blockIds', 'extra'])).toBe('blockIds')
    expect(suggestKey('owed_to', ['owedTo', 'due'])).toBe('owedTo')
    expect(suggestKey('Due', ['due'])).toBe('due')
  })

  it('says nothing rather than guessing when the key is not close to anything', () => {
    expect(suggestKey('bogusField', ['context', 'parts', 'paths'])).toBeNull()
    expect(suggestKey('horizon_ms', ['numbers', 'evidence', 'caveat'])).toBeNull()
  })

  it('lets a key the schema names outright beat the nearest string', () => {
    const moduleKeys = ['context', 'parts', 'paths', 'summary', 'summaryBlocks', 'source', 'extra']
    // Distance alone answers "parts" here, which is a real field and the wrong one.
    expect(suggestKey('charts', moduleKeys)).toBe('summaryBlocks')
    expect(suggestKey('blocks', moduleKeys)).toBe('summaryBlocks')
    // The same wrong key means a different field on a different kind, so the answer follows the
    // keys that kind actually has rather than a single global mapping.
    expect(suggestKey('blocks', ['blockIds', 'source', 'extra'])).toBe('blockIds')
  })

  it('does not offer a named wrong key to a kind that has no such field', () => {
    // A claim has no summary blocks, so `charts` on one is not a mis-key for them and there is
    // nothing honest to suggest.
    expect(suggestKey('charts', ['evidence', 'method', 'numbers', 'caveat', 'source', 'extra'])).toBeNull()
  })
})
