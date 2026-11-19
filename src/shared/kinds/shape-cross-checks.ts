// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RULES INSIDE ONE NESTED OBJECT: the word budgets, the cutting rule and the by-part rules for
 * the two short-form shapes, and every other shape-level rule the kinds declare.
 *
 * They were moved out of src/shared/kinds.ts with no change of behaviour: the same declarations,
 * the same comments and the same values. `SHAPE_CROSS_CHECKS` gained the `export` word, because
 * the checker that stays in kinds.ts reads it. `ShapeCheck` and `shortFormsShapeCheck` stay
 * private here.
 *
 * THIS FILE IMPORTS THE `ValidationError` TYPE AND `isPlainObject` FROM ./describe-value.ts,
 * `PARTS_KEY`, `STORED_SHORT_FORM_LEVELS`, `partsProblems`, `readStoredParts`, `shortFormProblems`
 * AND THE `ShortFormTexts` TYPE FROM ../zoom.ts, `STABLE_BOOTSTRAP_SHAPE_CHECKS` FROM
 * ../stable-bootstrap-notices.ts, `checklistItemRulesBroken` FROM ../checklists.ts, `readMessageLabel`
 * FROM ../message-label.ts, AND `A_STEP_BY_HAND_SAYS_WHY` AND `BY_HAND` FROM ../flow-run.ts. IT
 * IMPORTS NOTHING FROM ../kinds.ts: SHAPE_CROSS_CHECKS is built while this file loads, and every
 * check it names is declared elsewhere or here.
 */
import type { ValidationError } from './describe-value.ts'
import { isPlainObject } from './describe-value.ts'
import { PARTS_KEY, STORED_SHORT_FORM_LEVELS, partsProblems, readStoredParts, shortFormProblems, type ShortFormTexts } from '../zoom.ts'
import { STABLE_BOOTSTRAP_SHAPE_CHECKS } from '../stable-bootstrap-notices.ts'
import { checklistItemRulesBroken } from '../checklists.ts'
import { readMessageLabel } from '../message-label.ts'
import { A_STEP_BY_HAND_SAYS_WHY, BY_HAND } from '../flow-run.ts'

// ============================================================================ rules inside a shape
//
// The same thing as `CROSS_CHECKS` in ./cross-checks.ts, one level down: rules that need more than
// one key of ONE NESTED OBJECT.
//
// WHY THEY LIVE ON THE SHAPE RATHER THAN ON EVERY KIND THAT USES IT. `Pause` is declared on eight
// kinds. Written as a kind-level rule it would be eight copies of one sentence and one function,
// with nothing making the eight agree — the defect this codebase keeps producing, and the reason
// half the recent commits exist. Written here it runs wherever the shape appears, however many
// kinds that turns out to be, and the English half goes in the shape's own `rules`, which
// GET /api/kinds serves beside its fields.

type ShapeCheck = (value: Record<string, unknown>, path: string) => ValidationError[]

/**
 * THE WORD BUDGETS, THE CUTTING RULE AND THE BY-PART RULES, for both short-form shapes.
 *
 * ENFORCED ON THE CONTAINER RATHER THAN ON ONE FORM, because a `ShortForm` does not know which of
 * the lengths it is: the key it sits under is what says that, and the budget follows from the key.
 * The container also sees every length at once, which is what the cutting rule needs — it is a
 * comparison between two of them, and neither one alone can answer it.
 *
 * ONE FUNCTION FOR TWO SHAPES. `ShortForms` and `ShortFormsWithParts` are one shape with and
 * without the by-part structure, and every rule here holds for both. A copy per shape would be the
 * budgets enforced on a report and not on a task, or the other way round, with nothing failing.
 *
 * WHAT IT CANNOT SEE is whether a form is a cut of the record's own words, because those are a
 * different field on every kind. That half is `checkShortFormsAgainstBody` in
 * src/server/lib/summary.ts for a kind that holds blocks, and `settleShortForms` in
 * src/server/lib/zoom.ts for a kind that holds none.
 */
function shortFormsShapeCheck(value: Record<string, unknown>, path: string): ValidationError[] {
  const texts: ShortFormTexts = {}
  for (const level of STORED_SHORT_FORM_LEVELS) {
    const form = value[level]
    // Every key here has already passed its own check, so a present one is a whole ShortForm with
    // a string `text`. It is read rather than assumed, because a rule that throws while reporting
    // a rule is worse than the rule being missed.
    if (isPlainObject(form) && typeof form['text'] === 'string') texts[level] = form['text']
  }
  const problems = shortFormProblems(texts).map((problem) => ({
    path: `${path}.${problem.level}.text`,
    message: `${path}.${problem.level}.text: ${problem.message}`,
  }))
  // AN EMPTY LIST OF PARTS IS REFUSED HERE AND NOWHERE ELSE, and it needs its own line because
  // `readStoredParts` cannot see it: a structure with no parts is not a summary of anything, so
  // every READER answers null for it, and a check built on a reader would have nothing to
  // complain about. Measured 3 September 2026: `{"forms":{"parts":[]}}` was answered 200 with
  // nothing stored that any surface could draw — a write reported as done that did nothing, which
  // is the first engineering rule broken.
  const held = value[PARTS_KEY]
  if (isPlainObject(held) && Array.isArray(held['parts']) && held['parts'].length === 0) {
    return [
      ...problems,
      {
        path: `${path}.${PARTS_KEY}.parts`,
        message:
          `${path}.${PARTS_KEY}.parts is an empty list, so it says nothing about the report. Leave the whole ` +
          `structure out instead: nothing written is a real answer and Mole Office says it out loud, while an ` +
          `empty list is stored and drawn by nothing.`,
      },
    ]
  }
  // AND THE BY-PART STRUCTURE, JUDGED BY THE SAME BUDGETS. `readStoredParts` is handed the whole
  // container because that is the shape it reads, and it answers null for anything it cannot read
  // whole — which the field checks above have already refused in their own words.
  const parts = readStoredParts(value)
  if (parts === null) return problems
  return [
    ...problems,
    ...partsProblems(parts.parts).map((problem) => ({
      path: `${path}.${PARTS_KEY}`,
      message: `${path}.${PARTS_KEY}, ${problem.part}${problem.text === null ? '' : `.${problem.text}`}: ${problem.message}`,
    })),
  ]
}

// A GATE NO LONGER LIVES INSIDE A RECORD, so there is no gate check here any more. It used to ride
// on `StepNeed`, a nested object on a pipeline step, and the wording for a malformed one had to name
// a path like `data.steps[1].needs[0].upTo`. A block is a record and a dependency is a `blocks`
// link, so a gate now has exactly one carrier — the link — and `checkGate` in server/lib/records/link-gates.ts
// is the one place that refuses a malformed one, using `gateFault` from shared/work.ts. One carrier
// is what the two halves of this rule coming apart in 2026-08 cost, and this removes the second one
// rather than keeping it in step.

export const SHAPE_CROSS_CHECKS: Partial<Record<string, ShapeCheck>> = {
  ...STABLE_BOOTSTRAP_SHAPE_CHECKS,
  /**
   * A CHECKLIST ITEM IS DONE ONLY WITH EVIDENCE, AND A MANUAL ITEM ONLY WITH A MANUAL
   * SECTION. The rules are in src/shared/checklists.ts, and this is the one place they run,
   * so every path that writes a checklist meets them.
   */
  ChecklistRequest: (value, path) => checklistItemRulesBroken(value, path),
  /** A person's own label on a message. The rules are `readMessageLabel` in src/shared/message-label.ts, read once there. */
  MessageLabel: (value, path) => {
    const read = readMessageLabel(value)
    return read.ok ? [] : [{ path, message: `${path}: ${read.why}` }]
  },
  /**
   * A quoted span may not end before it starts.
   *
   * ENFORCED HERE RATHER THAN ONLY ON THE WRITE PATH, because the same shape arrives two ways: a
   * comment to an agent goes through `checkSpan` in src/server/lib/targets.ts, and an annotation's
   * `context` goes through `validateData` like every other field of every other record. A rule kept
   * on one of the two paths is a rule the other path does not have.
   */
  Span: (value, path) => {
    const from = value['from']
    const to = value['to']
    if (typeof from !== 'number' || typeof to !== 'number' || to >= from) return []
    return [
      {
        path,
        message:
          `${path} ends before it starts: from ${String(from)}, to ${String(to)}. Both are counted from 0 in the ` +
          'stored string the words came from, so `to` is at least `from`. They are hints about where the words ' +
          'were and nothing ever repairs them, which is exactly why a pair that cannot be true is refused here ' +
          'rather than stored and puzzled over later.',
      },
    ]
  },

  // THE SHORT-FORM RULES, ON BOTH SHAPES. `shortFormsShapeCheck` above says what they are and why
  // one function serves two shapes.
  //
  // THIS TABLE IS KEYED BY SHAPE NAME, so a shape missing from it is a shape whose rules simply
  // never run. Measured while `ShortFormsWithParts` was being added: the report kind moved to the
  // new shape, this key was not here yet, and every budget refusal on a report went quiet with a
  // 200. `tests/zoom.test.ts` now names both shapes.
  ShortForms: shortFormsShapeCheck,
  ShortFormsWithParts: shortFormsShapeCheck,

  /** A step done by hand says why. The hand-step door has no check of its own: this is the rule it meets. */
  FlowRunStep: (value, path) => {
    const why = value['why']
    if (value['how'] !== BY_HAND || (typeof why === 'string' && why.trim() !== '')) return []
    return [{ path: `${path}.why`, message: `${path}: ${A_STEP_BY_HAND_SAYS_WHY}` }]
  },

  PauseUntil: (value, path) => {
    // Every key that is here has already passed its own check, so anything present is one of the
    // three and is a usable value. Only the empty object is left to catch.
    if (Object.keys(value).length > 0) return []
    return [
      {
        path,
        message:
          `${path} is empty, so it says nothing about what should end this pause, and readPause drops it — the ` +
          'value would be stored and never read. Write a date, a condition in words, or the recordId of the record ' +
          'whose finishing should resume it. If there is genuinely no idea when, leave "until" out entirely: the ' +
          'pause is then reported as open-ended, which is honest, rather than looking like one that is waiting on ' +
          'something nobody wrote down.',
      },
    ]
  },
}
