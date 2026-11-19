// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The semantics a record can now carry: who is hurt, what was put down on purpose, what waits on
 * what, and whether a promise was kept.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE FOR
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/work.ts` says what these things MEAN. `src/shared/kinds.ts` says how they are
 * STORED and refuses anything else. Those are two files that have to agree, and this is the file
 * that fails when they stop agreeing — which is the only kind of agreement this codebase trusts,
 * because every real defect found in it has been two places that must match with nothing making
 * them match.
 *
 * So the assertions below fall into three groups:
 *
 *   1. THE SCHEMA AND THE READERS AGREE. Everything `validateData` accepts, the reader in work.ts
 *      can read back whole — `readConsequence`, `readPause`, `readFulfilment`. A field that
 *      validates and then reads back as null is a field that is stored and never seen again,
 *      which is the failure kinds.ts exists to prevent.
 *
 *   2. A DEPENDENCY IS NOT A RECORD FIELD, AND NEITHER IS A GATE. This group used to check that a
 *      partial gate inside a pipeline step said how far, because a step's `needs[]` was a second
 *      dependency system with a gate of its own. That system is gone: what a block waits on is a
 *      `blocks` link, and the gate rules are enforced by `checkGate` and driven end to end in
 *      tests/gate-rule.test.ts. What is left here is the guard that the removed shape is also
 *      REFUSED, so re-adding it is a failing test rather than a silent 201.
 *
 *   3. THE WORDS CANNOT DRIFT. The six consequence bearers, the two gate kinds and the three
 *      obligation states are read out of the constants that declare them, never retyped here, and
 *      the descriptions an agent reads over HTTP are checked for every one of those words. A
 *      seventh bearer added to work.ts fails this file until the schema describes it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectPanelError, freshDb, one, type TestDb } from './helpers.ts'
import {
  CLAIM_STATES,
  DECISION_SUMMARY_BELONGS,
  DECISION_SUMMARY_GUIDANCE,
  KIND_SPECS,
  OBLIGATION_STATES,
  SHAPE_SPECS,
  validateData,
  validateShape,
  type ValidationError,
} from '../src/shared/kinds.ts'
import { DIRECTION_DEPTHS, RECORD_KINDS, type RecordKind } from '../src/shared/types.ts'
import { SHORT_FORMS_FIELD } from '../src/shared/zoom.ts'
import {
  CONSEQUENCE_BEARERS,
  GATE_KINDS,
  gateIsWellFormed,
  isSafety,
  progressOf,
  readConsequence,
  readFulfilment,
  readPause,
} from '../src/shared/work.ts'

// -------------------------------------------------------------------------------- helpers

function refusal(kind: RecordKind, data: unknown): ValidationError[] {
  const result = validateData(kind, data)
  if (result.ok) throw new Error(`expected ${kind} data to be refused, but it was accepted: ${JSON.stringify(data)}`)
  return result.errors
}

function accept(kind: RecordKind, data: unknown): Record<string, unknown> {
  const result = validateData(kind, data)
  if (!result.ok) {
    throw new Error(`expected ${kind} data to be accepted, but: ${result.errors.map((e) => e.message).join(' | ')}`)
  }
  return result.data
}

/** The one error at this path, or a failure naming the paths that were actually reported. */
function errorAt(errors: readonly ValidationError[], path: string): ValidationError {
  const found = errors.filter((e) => e.path === path)
  const [first, ...rest] = found
  if (first === undefined || rest.length > 0) {
    throw new Error(`expected exactly one error at ${path}, got ${found.length}. All paths: ${errors.map((e) => e.path).join(', ')}`)
  }
  return first
}

/** The description of one field of one kind, or a failure saying the field is not declared. */
function descriptionOf(kind: RecordKind, key: string): string {
  const field = KIND_SPECS[kind].fields.find((f) => f.key === key)
  if (field === undefined) throw new Error(`${kind} has no ${key} field`)
  return field.description
}

/**
 * The kinds that carry `consequence` and `paused`.
 *
 * Written out rather than computed, because this list IS the claim: these are the kinds that can
 * need somebody's attention, so these are the kinds that must be able to say how bad it would be
 * to leave them and whether they were put down on purpose. Computing it from the schema would
 * make the test agree with whatever the schema happens to say.
 */
const CAN_NEED_ATTENTION: readonly RecordKind[] = [
  'task',
  'obligation',
  'problem',
  'purchase',
  'module',
  'pipeline',
  'claim',
  'direction',
]

/** A `task`, because it has no required fields and so tests one thing at a time. */
const taskWith = (extra: Record<string, unknown>): Record<string, unknown> => ({ state: 'blocked', ...extra })

const A_CONSEQUENCE = {
  bearer: 'person',
  what: 'The rig keeps moving after the stop button is pressed, and somebody stands next to it.',
}

const A_PAUSE = {
  since: '2026-08-01',
  why: 'The force gauge went back to the metrology lab, so nothing can be measured.',
}

// ================================================================================ consequence

describe('who is hurt if this is left alone', () => {
  it('can be recorded on every kind that can need attention', () => {
    for (const kind of CAN_NEED_ATTENTION) {
      const keys = KIND_SPECS[kind].fields.map((f) => f.key)
      expect(keys, `${kind} must be able to say who is hurt`).toContain('consequence')
      expect(keys, `${kind} must be able to say it was put down on purpose`).toContain('paused')
    }
  })

  it('says in the schema that this is how a safety-critical item is recorded', () => {
    // The three sentences the field has to carry, on every kind, because an agent writing a
    // record reads this description and nothing else. Leaving `consequence` out is the default
    // and the default has to be visibly costly, or nobody will ever write it.
    for (const kind of CAN_NEED_ATTENTION) {
      const description = descriptionOf(kind, 'consequence')
      expect(description, `${kind}.consequence`).toContain('SAFETY-CRITICAL')
      expect(description, `${kind}.consequence`).toContain('NEVER work it out from the title')
      expect(description, `${kind}.consequence`).toContain('ranked as though nothing depended on it')
    }
  })

  it('names every bearer there is, so a seventh cannot be added without the schema saying so', () => {
    // Read out of CONSEQUENCE_BEARERS rather than typed here. work.ts is the authority on what
    // the words mean; this is the mechanism that stops the schema describing five of six.
    const onTheKind = descriptionOf('task', 'consequence')
    const onTheShape = SHAPE_SPECS.Consequence?.fields.find((f) => f.key === 'bearer')?.description ?? ''
    for (const bearer of CONSEQUENCE_BEARERS) {
      expect(onTheKind, `task.consequence names "${bearer}"`).toContain(bearer)
      expect(onTheShape, `Consequence.bearer explains "${bearer}"`).toContain(bearer)
    }
  })

  it('accepts every bearer, and only marks a person as safety', () => {
    for (const bearer of CONSEQUENCE_BEARERS) {
      const data = accept('task', taskWith({ consequence: { bearer, what: 'what happens if nobody touches it' } }))
      const read = readConsequence(data)
      expect(read?.bearer, bearer).toBe(bearer)
      expect(isSafety(read), `isSafety for ${bearer}`).toBe(bearer === 'person')
    }
  })

  it('reads back through work.ts exactly what the schema accepted', () => {
    // The agreement that matters. A consequence that validates and then reads back as null is a
    // consequence that is stored and never seen again — the failure kinds.ts exists to prevent.
    const data = accept('problem', { symptom: 'the stop button does nothing', consequence: A_CONSEQUENCE })
    expect(readConsequence(data)).toEqual(A_CONSEQUENCE)
  })

  it('refuses a bearer nobody has defined, and lists the ones that exist', () => {
    const message = errorAt(refusal('task', taskWith({ consequence: { bearer: 'the lab', what: 'x' } })), 'data.consequence.bearer').message
    expect(message).toContain(`one of: ${CONSEQUENCE_BEARERS.join(', ')}`)
    expect(message).toContain('the string "the lab"')
  })

  it('refuses half a consequence, because a bearer with no sentence draws as a bare word', () => {
    expect(errorAt(refusal('task', taskWith({ consequence: { bearer: 'person' } })), 'data.consequence.what').message).toContain(
      'data.consequence.what is required',
    )
    expect(errorAt(refusal('task', taskWith({ consequence: { what: 'somebody gets hurt' } })), 'data.consequence.bearer').message).toContain(
      'is required',
    )
  })

  it('refuses a blank sentence rather than storing a gap that reads as missing data', () => {
    const message = errorAt(refusal('task', taskWith({ consequence: { bearer: 'person', what: '   ' } })), 'data.consequence.what').message
    expect(message).toContain('an empty string')
  })

  it('keeps "nobody has said" and "nothing follows from it" as different answers', () => {
    // An absent consequence is a gap. `bearer: "none"` is a judgement somebody made. Collapsing
    // them would turn a question into an answer, which is the thing this whole vocabulary is for.
    expect(readConsequence(accept('task', taskWith({})))).toBeNull()
    expect(readConsequence(accept('task', taskWith({ consequence: { bearer: 'none', what: 'nothing waits on it' } })))).toEqual({
      bearer: 'none',
      what: 'nothing waits on it',
    })
  })
})

// ===================================================================================== pause

describe('work that was put down on purpose', () => {
  it('says in the schema why the reason is required', () => {
    for (const kind of CAN_NEED_ATTENTION) {
      expect(descriptionOf(kind, 'paused'), `${kind}.paused`).toContain('abandonment')
    }
  })

  it('accepts a pause with a date and a reason, and reads back through work.ts', () => {
    const data = accept('task', taskWith({ paused: A_PAUSE }))
    expect(readPause(data)).toEqual(A_PAUSE)
  })

  it('refuses a pause with no reason', () => {
    // A pause with no reason is indistinguishable from abandonment a month later, so the reason
    // is refused on the way in rather than reported as something to fill in later — by the time
    // anybody reads the record, nobody remembers.
    const message = errorAt(refusal('task', taskWith({ paused: { since: '2026-08-01' } })), 'data.paused.why').message
    expect(message).toContain('data.paused.why is required')
    expect(message).toContain('abandonment')
  })

  it('refuses a pause with no date, because an old pause has to be visible as an old one', () => {
    expect(errorAt(refusal('task', taskWith({ paused: { why: 'waiting on the gauge' } })), 'data.paused.since').message).toContain(
      'is required',
    )
  })

  it('takes any one of the three ways of saying what should end it', () => {
    for (const until of [
      { date: '2026-09-01' },
      { condition: 'the replacement gauge is on the bench' },
      { recordId: 'rec_01J9ZQ8N6R7T2X4V' },
      { date: '2026-09-01', recordId: 'rec_01J9ZQ8N6R7T2X4V' },
    ]) {
      const data = accept('task', taskWith({ paused: { ...A_PAUSE, until } }))
      expect(readPause(data)?.until, JSON.stringify(until)).toEqual(until)
    }
  })

  it('refuses an empty `until`, which readPause would drop', () => {
    // Stored, read back as nothing, and it makes an open-ended pause look like one that is
    // waiting on something. Leaving `until` out says the same thing honestly.
    const message = errorAt(refusal('task', taskWith({ paused: { ...A_PAUSE, until: {} } })), 'data.paused.until').message
    expect(message).toContain('says nothing about what should end this pause')
    expect(message).toContain('leave "until" out entirely')
    expect(message).toContain('open-ended')
  })

  it('reports an open-ended pause as a pause, not as a gap', () => {
    const data = accept('task', taskWith({ paused: A_PAUSE }))
    const read = readPause(data)
    expect(read?.why).toBe(A_PAUSE.why)
    expect(read?.until).toBeUndefined()
  })

  it('refuses a key inside `until` that nothing reads', () => {
    const message = errorAt(
      refusal('task', taskWith({ paused: { ...A_PAUSE, until: { untilRecord: 'rec_1' } } })),
      'data.paused.until.untilRecord',
    ).message
    expect(message).toContain('unknown key "untilRecord"')
  })

  it('writes the rule down in English as well as in code', () => {
    // A rule enforced by a function nobody can read over HTTP is a rule an agent will break.
    expect(SHAPE_SPECS.PauseUntil?.rules?.join(' ')).toContain('at least one')
  })
})

// ====================================================================== a pipeline's blocks

describe('a pipeline says which blocks it holds, in order', () => {
  it('takes `blockIds` and refuses `steps`', () => {
    // The stored key MOVED, and a write using the old one is refused by name rather than being
    // stored in `extra` where nothing would ever read it. That refusal is the whole reason the key
    // is checked at all: a pipeline whose steps went into `extra` renders as an empty pipeline and
    // calls it correct.
    accept('pipeline', { blockIds: ['hv2-01', 'hv2-02'] })
    const message = refusal('pipeline', { steps: [{ id: 'a', name: 'A', state: 'done', modules: [] }] })
      .map((e) => e.message)
      .join(' ')
    expect(message).toContain('unknown key "steps"')
    expect(message).toContain('blockIds')
  })

  it('refuses the same block twice, because a block is at one position or it is nowhere', () => {
    // Two steps sharing one id was ACCEPTED by the old model, with a 201, and the attention API
    // then served two rows carrying one key. It is refused here, by position.
    const errors = refusal('pipeline', { blockIds: ['a', 'b', 'a'] })
    expect(errors.map((e) => e.path)).toEqual(['data.blockIds[2]'])
    expect(errors[0]?.message).toContain('already listed earlier')
  })

  it('says in English what the server checks against the database', () => {
    // The rule about every id being a live block needs rows this file cannot see, so it is enforced
    // on the server and PUBLISHED here. A rule that is enforced somewhere a caller cannot read is a
    // rule a caller meets as a surprise.
    //
    // AND THE ONE THAT IS NOT A REFUSAL IS PUBLISHED TOO. A block belonged to exactly one pipeline
    // until the owner reversed that on 6 September 2026. Saying nothing
    // would leave a caller to find out by trying, and the old rule is what everybody remembers.
    const rules = KIND_SPECS.pipeline.rules?.join(' ') ?? ''
    expect(rules).toContain('live record of kind `block`')
    expect(rules).toContain('may not appear twice')
    expect(rules).toContain('More than one pipeline may list the same block')
  })

  it('points a caller at the route that files a block, not at the array', () => {
    expect(descriptionOf('pipeline', 'blockIds')).toContain('/blocks')
    expect(descriptionOf('pipeline', 'blockIds')).toContain('DO NOT WRITE THIS BY HAND')
  })
})

describe('a block is a record with its own fields', () => {
  it('takes state and measured, and nothing about modules or dependencies', () => {
    // Those two are LINKS. A `modules` field beside an `implements` link is what one accepted
    // module rename broke ten of, behind a 200, and a `needs` field beside a `blocks` link is the
    // dependency graph existing twice.
    const keys = KIND_SPECS.block.fields.map((f) => f.key)
    expect(keys).toContain('state')
    expect(keys).toContain('measured')
    expect(keys).not.toContain('modules')
    expect(keys).not.toContain('needs')
    expect(keys).not.toContain('id')
  })

  it('carries the attention fields, so a failed block can raise an alarm', () => {
    const keys = KIND_SPECS.block.fields.map((f) => f.key)
    expect(keys).toContain('consequence')
    expect(keys).toContain('paused')
  })

  it('accepts a block, and refuses a state that is not one of the five', () => {
    accept('block', { state: 'doing', measured: 'p50 42 ms · n=400' })
    expect(refusal('block', { state: 'nearly' })[0]?.message).toContain('doing')
  })

  it('says a block is filed through its pipeline, and where its title comes from', () => {
    expect(KIND_SPECS.block.whenToRecord).toContain('/blocks')
    const rules = KIND_SPECS.block.rules?.join(' ') ?? ''
    expect(rules).toContain('\u203a')
    expect(rules).toContain('implements')
    expect(rules).toContain('blocks')
  })

  it('has no nested step shape left to disagree with it', () => {
    // FIVE READINGS OF ONE STORED STEP became one. `PipelineStep` and `StepNeed` were published
    // shapes; both are gone rather than kept beside the record kind, because two definitions of one
    // stored thing always drift apart and this repository has the scars.
    expect(Object.keys(SHAPE_SPECS)).not.toContain('PipelineStep')
    expect(Object.keys(SHAPE_SPECS)).not.toContain('StepNeed')
  })
})

// ================================================================================ fulfilment

describe('an obligation can say the promise was kept', () => {
  const owed = (extra: Record<string, unknown>): Record<string, unknown> => ({ due: '2026-08-14', ...extra })

  it('still has `done`, which was there all along', () => {
    // The mechanism was never missing; nothing wrote it. A second flag beside it would have made
    // two answers to one question, with the alarm panel reading one of them.
    const field = KIND_SPECS.obligation.fields.find((f) => f.key === 'done')
    expect(field?.type).toBe('boolean')
    expect(field?.required).toBe(false)
  })

  it('says what writes `done`, which is the part nobody could find out', () => {
    const description = descriptionOf('obligation', 'done')
    expect(description).toContain('PATCH /api/records')
    expect(description).toContain('NOTHING EVER WROTE IT')
  })

  it('records when it was kept and what settled it, beside `done` and not instead of it', () => {
    const data = accept(
      'obligation',
      owed({ done: true, fulfilledAt: '2026-08-12 16:40', fulfilledNote: 'Both pages are in the shared drive.' }),
    )
    expect(readFulfilment(data)).toEqual({
      done: true,
      at: '2026-08-12 16:40',
      note: 'Both pages are in the shared drive.',
    })
  })

  it('reads as kept-but-undated when nobody said when, rather than as not kept', () => {
    expect(readFulfilment(accept('obligation', owed({ done: true })))).toEqual({ done: true, at: null, note: null })
  })

  // ------------------------------------------------------------------------- the state word

  it('uses a vocabulary work.ts already classifies', () => {
    // Every word this file invented has to be one STATE_MEANING knows. A word nobody has
    // classified comes back as `unclassified`, which is an honest answer to a question about an
    // old record and an embarrassing one about a vocabulary written this week.
    for (const state of OBLIGATION_STATES) {
      const progress = progressOf(state)
      expect(progress, `progressOf("${state}")`).not.toBe('unclassified')
      expect(progress, `progressOf("${state}")`).not.toBeNull()
    }
  })

  it('agrees with readFulfilment about which of those words discharge it', () => {
    // The two readers in work.ts must give the same answer about the same word: a state that
    // reads as finished is a state that discharges the obligation. Neither is retyped here.
    for (const state of OBLIGATION_STATES) {
      expect(readFulfilment({ state }).done, `readFulfilment for "${state}"`).toBe(progressOf(state) === 'finished')
      accept('obligation', owed({ state }))
    }
  })

  it('refuses a state nobody has defined', () => {
    const message = errorAt(refusal('obligation', owed({ state: 'done' })), 'data.state').message
    expect(message).toContain(`one of: ${OBLIGATION_STATES.join(', ')}`)
  })

  // --------------------------------------------------------------- the two halves must agree

  it('refuses `done: false` beside a state that discharges it', () => {
    // readFulfilment reads the two TOGETHER and takes either as a yes, so a record that
    // contradicts itself has one of its halves silently thrown away.
    for (const state of ['fulfilled', 'cancelled']) {
      const message = errorAt(refusal('obligation', owed({ state, done: false })), 'data.done').message
      expect(message, state).toContain('two ways of saying opposite things')
    }
  })

  it('refuses `done: true` beside a state that says it is still owed', () => {
    const message = errorAt(refusal('obligation', owed({ state: 'open', done: true })), 'data.state').message
    expect(message).toContain('still owed')
  })

  it('accepts the two halves when they agree', () => {
    accept('obligation', owed({ state: 'fulfilled', done: true, fulfilledAt: '2026-08-12' }))
    accept('obligation', owed({ state: 'open' }))
    accept('obligation', owed({ state: 'open', done: false }))
  })

  it('refuses a discharge date on an obligation nothing marks as discharged', () => {
    // The same shape of failure as a `retracted_because` on a claim nothing marks as retracted:
    // the proof is stored, every panel goes on showing the obligation as owed, and the record
    // looks handled.
    const message = errorAt(refusal('obligation', owed({ fulfilledAt: '2026-08-12 16:40' })), 'data.done').message
    expect(message).toContain('nothing marks it as discharged')
    expect(message).toContain('data.done: true')

    const both = errorAt(refusal('obligation', owed({ fulfilledAt: '2026-08-12', fulfilledNote: 'delivered' })), 'data.done').message
    expect(both).toContain('data.fulfilledAt and data.fulfilledNote')
  })

  it('writes both rules down in English as well as in code', () => {
    const rules = KIND_SPECS.obligation.rules?.join(' ') ?? ''
    expect(rules).toContain('`done` and `state` must not disagree')
    expect(rules).toContain('fulfilledAt')
  })
})

// ==================================================== a dependency has exactly one representation

/**
 * NO RECORD FIELD CARRIES A DEPENDENCY, AND NO RECORD FIELD CARRIES A GATE.
 *
 * There were two dependency systems until a pipeline block became a record: a `blocks` LINK with a
 * gate on it, and a step's `needs[]` array with a gate of its own, inside `pipeline.data.steps`.
 * They happened to agree about most gates and disagreed about one, and neither knew the other
 * existed. The migration turned `needs[]` into `blocks` links.
 *
 * WHAT THIS GROUP GUARDS is the half of that a schema can guard: that the shape which stopped being
 * stored also stopped being ACCEPTED. A key the write path takes and no reader ever looks at is the
 * defect this whole file exists for — it is a 201 for text the author will never see again — and a
 * dependency is the worst possible case of it, because the record still draws, still ranks, and
 * simply has no edge.
 *
 * These pass today. They are here so that re-adding the second representation is a failing test
 * rather than a silent 201, which is exactly how the first one arrived.
 */
describe('a step `needs` array is not a shape any kind accepts', () => {
  /** The old shape, written out as an agent that learnt Mole Office before the migration would send it. */
  const OLD_NEEDS = [{ stepId: 'hv2-01', gate: 'hard' }]

  it('is refused on every one of the fifteen kinds, and nothing is stored', () => {
    for (const kind of RECORD_KINDS) {
      // `errorAt` rather than a substring search: the refusal has to be ABOUT `needs`, not a
      // by-product of some other complaint that happens to fail the write for its own reasons.
      const error = errorAt(refusal(kind, { needs: OLD_NEEDS }), 'data.needs')
      expect(error.message, `${kind} refusal`).toContain('unknown key "needs"')
    }
  })

  it('is refused on a block, which is the kind that used to be the step', () => {
    // The one place an agent is most likely to send it, and the one place a 201 would be worst: a
    // block accepting `needs` would store a dependency graph that no page reads and no link holds.
    const error = errorAt(refusal('block', { state: 'todo', needs: OLD_NEEDS }), 'data.needs')
    expect(error.message).toContain('unknown key "needs"')
  })

  // ------------------------------------------------ the refusal must not send the author to `extra`

  /**
   * THE 201 THAT SURVIVED THE MIGRATION, AND IT WAS ONE REFUSAL AWAY.
   *
   * The write path refused `needs` and `modules` correctly. What it then SAID was the generic
   * sentence every unknown key gets: "Anything this kind has no field for goes inside `extra`,
   * where it is stored and shown but nothing reads it." True of a misspelling. Catastrophic here.
   *
   * Followed, it produces `{"state":"todo","extra":{"needs":[…]}}`, which is answered 201 — the old
   * dependency shape stored as text that no link holds, no page draws and no query can find, on a
   * pipeline that renders with the edge simply missing. That is the second representation surviving
   * as ADVICE rather than as an accepted key, and it was the schema itself giving it.
   *
   * These two tests fail if that sentence comes back. They do not test that `extra` refuses the
   * key — it does not, deliberately: `extra` is the declared bag and anything may be put there ON
   * PURPOSE. What must never happen is somebody being SENT there.
   */
  for (const [key, sent] of [
    ['needs', OLD_NEEDS],
    ['modules', ['Tray clamp']],
  ] as const) {
    it(`answers \`${key}\` with the link to write, and never with "put it in extra"`, () => {
      const message = errorAt(refusal('block', { state: 'todo', [key]: sent }), `data.${key}`).message
      expect(message, 'must name the route that really records this').toContain('POST /api/links')
      expect(message, 'must not send a dependency into the bag nothing reads').not.toMatch(
        /goes inside "extra"|Anything this kind has no field for/,
      )
    })
  }

  it('names the right link type for each of the two, because they are different facts', () => {
    // Sending both to `blocks` would be the same collapse one layer up: what a block WAITS ON and
    // what CARRIES it are two relationships, and an author told the wrong one files a wrong edge
    // and is answered 201 for it.
    expect(errorAt(refusal('block', { state: 'todo', needs: OLD_NEEDS }), 'data.needs').message).toContain('"type":"blocks"')
    expect(errorAt(refusal('block', { state: 'todo', modules: ['Tray clamp'] }), 'data.modules').message).toContain(
      '"type":"implements"',
    )
  })

  it('still sends an ordinary misspelling to `extra`, so the exception stays an exception', () => {
    // The generic advice is right for every other unknown key and must survive. A table that
    // swallowed all of them would trade one bad sentence for a worse one.
    const message = errorAt(refusal('block', { state: 'todo', rig: 'bench jig 2' }), 'data.rig').message
    expect(message).toContain('goes inside "extra"')
  })

  it('declares no field named `needs`, `steps` or `stepId` anywhere in the contract', () => {
    // Kinds and nested shapes both, because `StepNeed` was a nested shape and that is where a
    // second representation would grow back. Read out of the specs rather than listed here, so a
    // sixteenth kind is covered the day it is declared.
    const declared = [
      ...Object.values(KIND_SPECS).flatMap((spec) => spec.fields.map((f) => `${spec.kind}.${f.key}`)),
      ...Object.values(SHAPE_SPECS).flatMap((shape) => shape.fields.map((f) => `${shape.name}.${f.key}`)),
    ]
    const gone = ['needs', 'steps', 'stepId']
    expect(declared.filter((path) => gone.includes(path.split('.')[1] ?? '')), 'fields of the old shape').toEqual([])
  })

  it('says on the block itself where a dependency really lives, and that zero links is not "nothing"', () => {
    // A refusal that only says "no such field" leaves the caller to guess. The block's published
    // rules have to name the link, and they have to keep the one distinction a link cannot store:
    // no link means no dependency was RECORDED, which is not the same sentence as "it waits on
    // nothing" and must not be printed as one.
    const rules = KIND_SPECS.block.rules?.join(' ') ?? ''
    expect(rules).toContain('`blocks` link')
    expect(rules).toContain('There is no `needs` field')
    expect(rules).toContain('RECORDED')
  })

  it('never asks `gateIsWellFormed` from the record write path, because no field is a gate', () => {
    // The gate rule has ONE carrier. If a field ever declared a gate again, `validateData` would
    // have to check it — a second enforcement — and that is the drift the migration removed. The
    // vocabulary is read out of GATE_KINDS rather than retyped, so a third gate kind is covered.
    const gateFields = [
      ...Object.values(KIND_SPECS).flatMap((spec) => spec.fields),
      ...Object.values(SHAPE_SPECS).flatMap((shape) => shape.fields),
    ].filter((field) => GATE_KINDS.every((word) => field.type.includes(`'${word}'`)))
    expect(gateFields.map((f) => f.key), 'fields declaring the gate vocabulary').toEqual([])

    // And the predicate itself still answers, so this test is measuring an absence rather than a
    // broken import: these are the two gates the ONE carrier takes.
    expect(gateIsWellFormed({ kind: 'hard' })).toBe(true)
    expect(gateIsWellFormed({ kind: 'partial' })).toBe(false)
  })
})

// ============================================================== the shapes the schema now serves

describe('the new shapes are declared, not implied', () => {
  it('declares every one of them, so validateData can check it', () => {
    for (const name of ['Consequence', 'Pause', 'PauseUntil']) {
      expect(Object.keys(SHAPE_SPECS), `${name} is declared`).toContain(name)
    }
  })

  it('gives every new shape and every new field a description somebody can act on', () => {
    for (const name of ['Consequence', 'Pause', 'PauseUntil']) {
      const shape = SHAPE_SPECS[name]
      expect(shape?.description.length, `${name}.description`).toBeGreaterThan(40)
      for (const field of shape?.fields ?? []) {
        expect(field.description.length, `${name}.${field.key}.description`).toBeGreaterThan(40)
      }
    }
  })

  it('types the new fields as the shapes rather than as loose objects', () => {
    // A field typed `Record<string, unknown>` would be stored unchecked, which is how a half
    // written consequence would reach the database and read back as nothing.
    expect(KIND_SPECS.task.fields.find((f) => f.key === 'consequence')?.type).toBe('Consequence')
    expect(KIND_SPECS.task.fields.find((f) => f.key === 'paused')?.type).toBe('Pause')
    expect(KIND_SPECS.block.fields.find((f) => f.key === 'consequence')?.type).toBe('Consequence')
  })
})

// ============================================================================== the write path

describe('the gate the server actually calls', () => {
  // validate.ts reaches summary.ts and through it records.ts, which opens SQLite the moment it is
  // imported. freshDb points that at a throwaway file before the import happens.
  let t: TestDb
  let gate: typeof import('../src/server/lib/validate.ts')

  beforeAll(async () => {
    t = await freshDb()
    gate = await import('../src/server/lib/validate.ts')
  })
  afterAll(() => t.close())

  const refuse = (kind: RecordKind, data: unknown): Error =>
    expectPanelError(t, () => gate.validateRecordData(kind, data), 400)

  it('turns a `steps` key on a pipeline into a 400, naming the key that replaced it', () => {
    // A GATE IS NOT CHECKED HERE ANY MORE. It used to ride on a step's `needs`, so this gate had a
    // pipeline path to point at; a gate rides on a `blocks` link and nothing else now, and
    // tests/gate-rule.test.ts checks it on the one carrier there is. What this path still has to do
    // is refuse the key that moved — a pipeline whose steps went into `extra` would render empty and
    // call it correct.
    const message = refuse('pipeline', {
      steps: [{ id: 'a', name: 'A', state: 'done', modules: [] }],
    }).message
    expect(message).toContain('unknown key "steps"')
    expect(message).toContain('blockIds')
  })

  it('turns a pause with no reason into a 400', () => {
    expect(refuse('task', { paused: { since: '2026-08-01' } }).message).toContain('abandonment')
  })

  it('lets a record carrying all of it through, and reports only what is genuinely unwritten', () => {
    const gaps = gate.validateRecordData('obligation', {
      owedTo: 'the ESA grant review',
      consequence: { bearer: 'outside', what: 'The review has nothing to assess and the payment is held.' },
      paused: { since: '2026-08-01', why: 'waiting on the force table', until: { condition: 'the reprint is measured' } },
    })
    // One gap, and it is the date — the field that decides whether it can ever come due. Neither
    // of the two new fields is required, because a record nobody has judged yet is still a record.
    expect(one(gaps, 'the obligation incompleteness').path).toBe('data.due')
  })
})

// =========================================================== what a claim's state word means

/**
 * A CLAIM'S THREE WORDS, AND THE ONE THAT USED TO MEAN TWO THINGS.
 *
 * A claim is the kind other work depends on, so how its state word is read decides what the front
 * screen says about a result. Until 10 August 2026 none of the three was read correctly:
 *
 *   `proposed` and `retracted` were not in STATE_MEANING at all, so a withdrawn claim landed in
 *   "nobody has said what this word means" — an honest answer to the wrong question, since the
 *   product's own schema is what told the agent to send the word.
 *
 *   `measured` was in STATE_MEANING as `in_flight`, because the direction depth ladder has a rung
 *   of the same name at level four of six. So a finished measurement was reported as work somebody
 *   is doing right now, which is the opposite of what the word means on a claim.
 *
 * THE COLLISION IS THE POINT OF THIS BLOCK. STATE_MEANING is flat on purpose — one word, one
 * meaning, product-wide — so the two readings could not both be kept, and scoping the table by kind
 * was refused. The resolution is that a direction's depth is not a state at all: it is stored under
 * `depth`, `progressOf` is only ever handed a `state`, and the depth ladder has its own meanings in
 * `DIRECTION_DEPTH_MEANINGS`. The six rungs came out of the state table and `measured` now means
 * what a claim means by it. The last test below is what stops the collision coming back.
 */
describe("what a claim's state word means", () => {
  it('classifies all three words the schema advertises for a claim', () => {
    // Read out of the vocabulary rather than retyped, so a fourth claim word fails here until
    // somebody says what it means, which is the whole cost of adding one.
    for (const state of CLAIM_STATES) {
      expect(progressOf(state), `progressOf("${state}")`).not.toBe('unclassified')
      expect(progressOf(state), `progressOf("${state}")`).not.toBeNull()
      accept('claim', { state })
    }
  })

  it('reads a measured claim as finished, not as somebody being on it right now', () => {
    expect(progressOf('measured')).toBe('finished')
  })

  it('reads a retracted claim as finished, and never as stopped short', () => {
    // `stopped_short` is the half of the attention rule that puts a record on the front screen. A
    // retraction is a decision that was carried out, with `retracted_because` required to say why,
    // so it is done. What a retraction breaks is whatever CONSUMED the claim, and that is a
    // different record and a different query.
    expect(progressOf('retracted')).toBe('finished')
    expect(progressOf('retracted')).not.toBe('stopped_short')
  })

  it('reads a proposed claim as not started, because no measurement has been taken', () => {
    // Not `in_flight`: a claim can sit proposed for months with nobody on it, and `in_flight` is a
    // statement about a person that nothing in the record supports.
    expect(progressOf('proposed')).toBe('not_started')
  })

  it('keeps the direction depth ladder out of the state table, where the collision was', () => {
    // Five of the six rungs are words the state table has never heard of, and that is correct: a
    // depth is not a state. The sixth shares its word with a claim, and the table is flat, so the
    // word has exactly one meaning — the claim's.
    for (const depth of DIRECTION_DEPTHS) {
      if (depth === 'measured') continue
      expect(progressOf(depth), `progressOf("${depth}")`).toBe('unclassified')
    }
    expect(progressOf('measured')).toBe('finished')

    // AND THE REASON THAT IS SAFE: a direction cannot store a state word at all, so no depth ever
    // reaches `progressOf`. Giving `direction` a `state` field over the depth words would put one
    // word back to meaning two things, and this is the line that fails when somebody tries.
    expect(KIND_SPECS.direction.fields.find((f) => f.key === 'state')).toBeUndefined()
    expect(KIND_SPECS.direction.fields.find((f) => f.key === 'depth')?.type).toBe(
      DIRECTION_DEPTHS.map((d) => `'${d}'`).join(' | '),
    )
  })
})

// ==================================================================== who is hurt, on an item

/**
 * A CHECKLIST ITEM AND A PIPELINE BLOCK CAN SAY WHO IS HURT.
 *
 * The rule in shared/attention.ts reads a consequence and a pause off the ITEM and off the BLOCK,
 * and the schema used to refuse both fields on both, so the only thing the rule could have read was
 * the one thing nobody could write. A `failed` checklist item that could hurt somebody had no way
 * to say so and could never reach the safety floor.
 *
 * The two are asked in two ways now, and that is the change rather than an inconsistency: an item
 * is a nested shape and a block is a record, so one is a SHAPE_SPEC and the other a KIND_SPEC.
 */
describe('a checklist item and a pipeline block can carry the attention fields', () => {
  it('declares consequence and paused on ProgressItem', () => {
    const keys = SHAPE_SPECS['ProgressItem']!.fields.map((f) => f.key)
    expect(keys).toContain('consequence')
    expect(keys).toContain('paused')
  })

  it('declares consequence and paused on the block kind', () => {
    const keys = KIND_SPECS.block.fields.map((f) => f.key)
    expect(keys).toContain('consequence')
    expect(keys).toContain('paused')
  })

  it('accepts a safety consequence on a checklist item, and work.ts reads it back', () => {
    const data = {
      context: 'The bench cell',
      parts: [
        {
          id: 'stop',
          name: 'Stop circuit',
          items: [
            {
              id: 'stop-1',
              text: 'Wire the E-stop loop to the contactor',
              state: 'failed',
              consequence: { bearer: 'person', what: 'The stop button does nothing and the arm keeps moving.' },
            },
          ],
        },
      ],
    }
    accept('module', data)
    const item = data.parts[0]!.items[0]!
    const read = readConsequence(item)
    expect(read).not.toBeNull()
    expect(isSafety(read), 'a person bearer is the safety marker').toBe(true)
  })

  it('accepts a pause on a pipeline block, and work.ts reads it back', () => {
    // ON THE BLOCK'S OWN RECORD. It used to be a key on a nested step object, which is why the
    // attention rule had to read a second bag; a block's pause is read from its `data` like every
    // other record's.
    const data = {
      state: 'blocked',
      paused: { since: '2026-08-01', why: 'The arm is in pieces on the bench until the new harness arrives.' },
    }
    accept('block', data)
    const read = readPause(data)
    expect(read?.why).toContain('harness')
  })

  it('still refuses a consequence with no sentence on an item, exactly as on a record', () => {
    const errors = refusal('module', {
      context: 'c',
      parts: [
        {
          id: 'p',
          name: 'P',
          items: [{ id: 'i', text: 't', state: 'todo', consequence: { bearer: 'person' } }],
        },
      ],
    })
    expect(errors.some((e) => e.path === 'data.parts[0].items[0].consequence.what')).toBe(true)
  })
})

// ============================================================ published examples must be real

/**
 * A path this contract SHOWS AN AGENT how to write must be a path that resolves.
 *
 * THE DEFECT, FOUND ON 2026-08-10. `src/web/lib/layout.ts` was deleted with the panel grid, and
 * both places `KIND_SPECS.module` shows a `claims` list went on naming it — the field's `example`
 * and the whole-record example, which are the two things `GET /api/kinds` serves to an agent that
 * is told to read that document INSTEAD of the source. An agent copying it files a module whose
 * claim resolves to nothing, which `GET /api/source/coverage` then reports as the agent's problem.
 *
 * The field's own documentation is what makes this a defect rather than a nitpick: it says an
 * unresolvable path "is reported as a problem, not stored as a claim that quietly never resolves".
 * An example that would be reported as a problem is teaching the mistake it warns about.
 *
 * GLOBS ARE SKIPPED, and that is a real limit rather than an oversight: `src/web/pages/**` is a
 * pattern, matching it here would mean reimplementing `filesMatching` inside a test, and the point
 * of this check is the literal paths — which are the ones that rot when a file is deleted.
 */
describe('the module contract shows an agent no path that could rot', () => {
  /**
   * WHAT THIS USED TO CHECK, AND WHY THE CHECK IS NOW THE OTHER WAY ROUND.
   *
   * `KIND_SPECS.module` showed a `claims` list in two places — the field's own `example` and the
   * whole-record example — and both are served by `GET /api/kinds` to an agent told to read that
   * document INSTEAD of the source. On 2026-08-10 both named `src/web/lib/layout.ts`, deleted with
   * the panel grid, so an agent copying the contract filed a claim that resolved to nothing and
   * `GET /api/source/coverage` reported it as the agent's problem. This file asserted that every
   * literal path shown there existed.
   *
   * Window B deleted the field, and with it both examples. The exposure is gone rather than fixed,
   * and this is the assertion that says so — plus the one that matters more: what an author is shown
   * INSTEAD is a ROUTE, and a route cannot rot the way a path can.
   */
  it('shows no claims example at all, because the field is gone', () => {
    expect(KIND_SPECS.module.fields.some((f) => f.key === 'claims')).toBe(false)
    expect((KIND_SPECS.module.example as Record<string, unknown> | undefined)?.['claims']).toBeUndefined()
  })

  it('answers an author who writes one with a route rather than a path', async () => {
    const { validateData } = await import('../src/shared/kinds.ts')
    const result = validateData('module', { context: 'x'.repeat(30), parts: [], claims: ['src/web'] })
    expect(result.ok).toBe(false)
    const said = result.ok ? '' : result.errors.map((e) => e.message).join('\n')
    expect(said).toContain('POST /api/implementation')
    // AND NO LITERAL SOURCE PATH IN THE SENTENCE, because a sentence naming a file is a sentence
    // that goes stale the day the file moves — which is the whole of the defect above.
    const paths = [...said.matchAll(/\bsrc\/[\w./-]+\.tsx?\b/g)].map((m) => m[0])
    expect(paths, 'the refusal names a source file that can be deleted under it').toEqual([])
  })
})

// ============================================================ as many options as the case has

/**
 * A PROPOSAL HAS AS MANY OPTIONS AS THE CASE HAS, AND ONE IS ALLOWED.
 *
 * WHAT WAS WRONG. The proposal kind's `options` description used to read *"Two at least: one option
 * is not a fork, it is a plan"*. The validator never enforced it — the server accepted a single
 * option and a run proved it on 21 September 2026 — but the sentence is what agents read over
 * `GET /api/kinds`, and they obeyed it as a rule. A one-option case was filed with three options
 * because of it. The writer is to fit the number of options to the case.
 *
 * THE WORDS ARE THE FEATURE HERE. There is no validator to mutation-test, so this is the test that
 * fails if the old minimum comes back: it pins the guidance an agent is served, not a check. The
 * behaviour the new guidance promises — one option is accepted, drawn and settled — is driven
 * against the real server in tests/a-proposal-may-carry-one-option.test.ts.
 */
describe('a proposal has as many options as the case has', () => {
  it('tells the writer to fit the number to the case, allows one plan to approve, and drops the old minimum', () => {
    const description = descriptionOf('proposal', 'options')
    expect(description).toContain('Fit the number to the case')
    expect(description).toContain('several where there is a real fork')
    expect(description).toContain('one where there is a plan to approve')
    expect(description).toContain('one option is allowed')
    // THE SENTENCE THAT WENT, kept here so a re-add fails rather than reads as a help.
    expect(description).not.toContain('Two at least')
    expect(description).not.toContain('one option is not a fork')
  })
})

// ============================================================ a decision's level-3 context

/**
 * DC1: THE DECISION KIND'S GUIDANCE FOR ITS `summary` SAYS WHAT THAT SUMMARY IS.
 *
 * Level 3 of the reading ladder is the record's own `summary`, and the only place the schema names
 * level 3 is the `shortForms` field description. So that description is where the guidance has to
 * be, and the kind also carries it under `summaryGuidance` for a caller that reads the kind itself.
 *
 * IT IS DECLARED ON THE DECISION ALONE, and that is asserted here rather than assumed: a second
 * kind that picked up a summary guidance would be telling its writers to put a context where its
 * readers expect a one-line caption.
 */
describe('the decision kind says what its level-3 context is', () => {
  it('writes the guidance into the shortForms description, which is where level 3 is named', () => {
    const description = descriptionOf('decision', SHORT_FORMS_FIELD)
    expect(description).toContain(DECISION_SUMMARY_BELONGS)
    // WHAT IT IS NOT: a restatement of the choice. DC1 names this half explicitly.
    expect(description).toContain('NOT a restatement of `option_taken`')
    expect(description).toContain('never invent one')
  })

  it('publishes it on the kind itself as well, so a caller reading the kind finds it', () => {
    expect(KIND_SPECS.decision.summaryGuidance).toBe(DECISION_SUMMARY_GUIDANCE)
  })

  it('declares it on the decision and no other kind', () => {
    // Read out of every declaration rather than listed here, so a kind that gains one fails this
    // file until somebody has said why its summary is a fact rather than a caption.
    const holds = RECORD_KINDS.filter((kind) => KIND_SPECS[kind].summaryGuidance !== undefined)
    expect(holds).toEqual(['decision'])
  })
})
