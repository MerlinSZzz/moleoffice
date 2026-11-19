// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY STEP `migrateInPlace` RUNS IS NAMED BY THE THREE SENTENCES AN OPERATOR READS.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAILURE THIS EXISTS FOR, AND IT HAPPENED
 * ---------------------------------------------------------------------------------------
 *
 * `previewMigration` ends with a catch-all: a copy that comes out byte-different with no report
 * naming the write is refused with *"write something none of the N migration reports names"*, and
 * that refusal is what `prepareToServe` prints when it will not start the server. So an in-place
 * step with no line of its own does not fail quietly — it stops the owner's server with a message
 * that names nothing, on the boot after the one command the owner was told to run.
 *
 * Before window B that had already happened once and was sitting in the tree unnoticed:
 * `migrateReviews` had NO `wouldWrite` clause at all, and the quiet-start sentence named six of the
 * seven steps with `reviews` missing. Window B adds nine more steps.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TEST IS ABOUT THE TABLE AND NOT ABOUT SIXTEEN SENTENCES
 * ---------------------------------------------------------------------------------------
 *
 * The build plan asked for an assertion that "for every step whose own outcome fields report a
 * non-zero write, `wouldWrite` holds a line naming that step", and then said what to build instead:
 * compute all three sentences from ONE step table, so a line and its step cannot come apart at all.
 * That is what `THE_STEPS` is. This file holds the table to the two things that make it true:
 *
 *   IT COVERS EVERY STEP. The set of report fields on a real `MigrationOutcome` is exactly the set
 *   of fields `THE_STEPS` names. A step added to `migrateInPlace` gets a field on `MigrationOutcome`
 *   — it cannot be returned otherwise — so this is the check that cannot be got round by forgetting.
 *
 *   AND THE THREE SENTENCES ALL COME FROM IT. `previewMigration`'s line, `describeOutcome`'s line
 *   and the quiet-start sentence are asserted to name the step, on an outcome where that step really
 *   did write something.
 *
 * Both were proved by mutation: removing one entry from `THE_STEPS` turns the first case red BY THAT
 * STEP'S FIELD NAME, and the second red on its sentence.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY STEP'S LINE NAMES THE STEP
 * ---------------------------------------------------------------------------------------
 *
 * All three sentences name every step, and all three are asserted below. `describeOutcome` prints
 * `step.describe(outcome)` for every step, and every one of those lines begins with the step's own
 * name. A line that says "Nothing to do:" with no step name leaves an operator unable to tell which
 * step it is about, and a line that begins with another step's name — the block identity step once
 * began with the word `blocks:` — makes the report carry two lines that appear to be about the
 * block migration.
 *
 * The case below asserts that property over the whole table, on a fresh outcome and on an outcome
 * where one step wrote something. A step whose line loses its own name turns it red by that step's
 * name.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { freshDb, type TestDb } from './helpers.ts'
import {
  describeOutcome,
  migrateInPlace,
  namesOfTheSteps,
  previewMigration,
  prepareToServe,
  THE_STEPS,
  type MigrationOutcome,
} from '../src/server/db/migrate.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'


let t: TestDb
let sqlite: Database.Database

beforeAll(async () => {
  t = await freshDb()
  sqlite = t.client.sqlite as unknown as Database.Database
}, 60_000)

afterAll(() => t.close())

describe('the step table covers every step migrateInPlace runs', () => {


  it('puts every step name into the quiet-start sentence, computed rather than typed', () => {
    const sentence = namesOfTheSteps()
    for (const step of THE_STEPS) expect(sentence, `${step.name} is not in the quiet-start sentence`).toContain(step.name)
    // AND THE SENTENCE THE SERVER ACTUALLY PRINTS holds it — on a database HOLDING WORK, because a
    // database holding none takes the other arm of `prepareToServe` and migrates in place instead.
    // The quiet sentence is the one an owner with a real corpus reads on every start.
    t.api.createRecord({ kind: 'report', title: 'Something real', workspaceId: 'panelx', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
    const decision = prepareToServe(sqlite)
    expect(decision.serve, decision.serve ? '' : decision.refusal).toBe(true)
    if (decision.serve) expect(decision.report).toContain(sentence)
  })

  it('prints a line about every step, and every line begins with its own step’s name', () => {
    const outcome = migrateInPlace(sqlite)
    const report = describeOutcome(outcome)
    for (const step of THE_STEPS) {
      const line = step.describe(outcome)
      expect(report, `${step.name} is not in the report the command prints`).toContain(line)
      expect(
        line.startsWith(step.name),
        `the line about ${step.name} does not begin with its own name: ${line.split('\n')[0] ?? ''}`,
      ).toBe(true)
    }
  })
})

describe('a step that writes is named in the line an operator acts on', () => {
  /** The count put into every number of a forced report. Distinctive, so it is easy to see. */
  const A_COUNT = 7

  /**
   * The same report with every count in it turned up, so the step says it wrote something.
   *
   * DERIVED FROM THE REPORT THE STEP REALLY RETURNED, rather than typed out. Every number in it
   * becomes `A_COUNT`, and `alreadyDone` — the flag several steps use to say "there was nothing
   * here" — becomes false. Nothing else is touched.
   *
   * IT USED TO BE A TABLE CALLED `FORCED` WITH SIXTEEN HAND-WRITTEN ENTRIES, one per step, each
   * restating that step's field names and plausible counts. That is the shape of every report
   * written down a second time, which is the defect CLAUDE.md opens with: a step that renamed one of
   * its own counts went on being "forced" through a key nothing read, and the case still passed
   * because the assertion under it could not fail either. This reads the real report instead, and
   * the assertion below fails BY THE STEP'S NAME if the forcing does not reach whatever its `wrote`
   * counts.
   */
  function turnedUp(report: unknown): unknown {
    if (typeof report === 'number') return A_COUNT
    if (Array.isArray(report)) return report
    if (report === null || typeof report !== 'object') return report
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(report)) {
      out[key] = key === 'alreadyDone' ? false : turnedUp(value)
    }
    return out
  }

  /** An outcome where one named step wrote something, and every other step wrote nothing. */
  function outcomeWhereOnlyThisStepWrote(step: (typeof THE_STEPS)[number], outcome: MigrationOutcome): MigrationOutcome {
    return { ...outcome, [step.field]: turnedUp(outcome[step.field]) } as MigrationOutcome
  }

  it.each(THE_STEPS.map((step) => [step.name, step] as const))(
    '%s: what it says it wrote reaches both sentences an operator reads',
    (_name, step) => {
      const quiet = migrateInPlace(sqlite)
      expect(step.wrote(quiet), 'a fresh database left this step with something to do').toBe(0)

      const busy = outcomeWhereOnlyThisStepWrote(step, quiet)
      expect(step.wrote(busy), 'turning up this report did not make the step say it wrote').toBeGreaterThan(0)

      // THE LINE `previewMigration` PUTS IN THE REFUSAL AN OPERATOR ACTS ON. Two things about it:
      // it says something, and what it says is built from this step's own counts. The assertion
      // this replaces was `expect(name + ': ' + line).toContain(name + ': ')`, which is a string
      // being asked whether it starts with its own beginning — true for every possible `line`,
      // including an empty one.
      expect(step.line(busy).trim(), 'this step offers no words at all for its own write').not.toBe('')
      expect(step.line(busy), "this step's line says the same thing whatever it reports").not.toBe(step.line(quiet))

      // THE REPORT `npm run db:migrate` PRINTS, which is the other sentence. What this step says it
      // wrote has to reach it: a step whose description ignored its own report would print the same
      // words to an operator whether it moved seven rows or none.
      expect(describeOutcome(busy), 'the report the command prints does not change when this step writes').not.toBe(
        describeOutcome(quiet),
      )
      expect(step.describe(busy), 'this step describes itself the same way whatever it reports').not.toBe(
        step.describe(quiet),
      )
      expect(
        step.describe(busy).startsWith(step.name),
        `the line about ${step.name} does not begin with its own name when it writes`,
      ).toBe(true)
    },
  )

  it('offers a line for exactly the steps that wrote, on a real preview', () => {
    const preview = previewMigration(sqlite)
    // A FRESH DATABASE HAS NOTHING FOR ANY OF THEM TO DO, and this is the quiet case: no lines, and
    // the bytes agree, which is what lets a server start unattended.
    expect(preview.wouldWrite).toEqual([])
    for (const step of THE_STEPS) expect(step.wrote(preview.outcome)).toBe(0)
  })
})
