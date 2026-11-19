// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY ROUGH DRAFT BECOMES A PLAN: migration 0196 and its data step.
 *
 * Problem k5FNfdgfxbt2 (rough thinking was kept in two stores), and item 6 of a decision, which carries out report
 * p414QK6jYovv. The step is `moveDraftsIntoPlans` in
 * src/server/db/drafts-into-plans-migration.ts, and `npm run db:migrate` runs it through `migrateInPlace`, which is
 * what this file runs too: a fresh database, the drafts table built by running migration 0008's own file again, seeded
 * with drafts, and the product's own migrate path over it. It proves:
 *
 *   1. a non-empty body becomes its lines exactly, blank lines and trailing white space kept;
 *   2. an empty body becomes a plan with no lines;
 *   3. a draft id no plan holds is kept as the plan id;
 *   4. a draft id a plan already holds is mapped to a new plan id, and a proposal naming the draft is read as about
 *      the plan it became, through `planOfDraft`;
 *   5. a draft over a plan limit is refused, said, and left with the table kept;
 *   6. every moved line carries the move's own stamp and no person, and the plan carries the draft's creator only
 *      where the draft recorded one;
 *   7. the lines the data step writes into the migrate log;
 *   8. a second run changes nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   (a) `linesOfBody(draft.body)` replaced by `draft.body.trimEnd().split('\n')`  -> case 1 goes red.
 *   (b) the empty-body branch removed, so '' becomes one empty line                -> case 2 goes red.
 *   (c) `planId` always a new nanoid                                               -> case 3 goes red.
 *   (d) `moved_from_draft` written as NULL                                         -> case 4 goes red.
 *   (e) the refusal check skipped, so every draft moves                            -> case 5 goes red.
 *   (f) `updated_by` written as the draft's `created_by`                           -> case 6 goes red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

const REPO = join(import.meta.dirname, '..')

let t: TestDb
let step: typeof import('../src/server/db/drafts-into-plans-migration.ts')
let migrate: typeof import('../src/server/db/migrate.ts')
let review: typeof import('../src/server/lib/planreview.ts')
let first: ReturnType<typeof migrate.migrateInPlace>
let firstLog = ''

const AGENT = { type: 'agent', id: 'the-reviewer' } as const

/** A body with a blank line, two trailing spaces, a tab, a table, and a newline at the end, which is an empty last line. */
const SHAPED = 'ICRA submission  \ntarget: September\n\nMust\n- baseline\t\n| a | b |\n|---|---|\n- 数据采集\n'
/** A body whose second line has twenty-three words, over the fifteen a plan line may hold. */
const TOO_LONG = 'Fine\nthis line has far too many words in it to be one line of a plan as the plan door holds them today'

beforeAll(async () => {
  t = await freshDb()
  step = await import('../src/server/db/drafts-into-plans-migration.ts')
  migrate = await import('../src/server/db/migrate.ts')
  review = await import('../src/server/lib/planreview.ts')
  const sqlite = t.client.sqlite

  // A PLAN THAT ALREADY HOLDS ONE DRAFT'S ID, written as a plan, so the move has to map that draft.
  sqlite
    .prepare(
      `INSERT INTO plans (id, title, state, read_at, created_at, updated_at, created_by, moved_from_draft) VALUES ('draft-taken', 'A plan that was always a plan', 'open', NULL, '2026-09-01 09:00:00', '2026-09-01 09:00:00', 'human:${THE_TEST_OFFICES_OWNER.id}', NULL)`,
    )
    .run()

  makeTheDraftsTable()
  const add = sqlite.prepare(
    'INSERT INTO planning_drafts (id, title, body, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
  )
  add.run('draft-shaped', 'ICRA submission — rough', SHAPED, '2026-08-01 09:00:00', '2026-08-03 18:15:00', `human:${THE_TEST_OFFICES_OWNER.id}`)
  add.run('draft-empty', 'Only a title', '', '2026-08-02 09:00:00', '2026-08-02 09:00:00', 'agent:orbit')
  add.run('draft-taken', 'Its id is taken', '- one\n- two', '2026-08-04 09:00:00', '2026-08-05 10:00:00', `human:${THE_TEST_OFFICES_OWNER.id}`)
  add.run('draft-nobody', 'Nobody recorded', 'a line', '2026-08-06 09:00:00', '2026-08-06 09:00:00', '')
  add.run('draft-too-long', 'Over the budget', TOO_LONG, '2026-08-07 09:00:00', '2026-08-07 09:00:00', `human:${THE_TEST_OFFICES_OWNER.id}`)

  // A PROPOSAL FILED ABOUT THE DRAFT WHOSE ID IS TAKEN, before the move, as the draft context route asked for one.
  t.api.createRecord({
    kind: 'proposal',
    workspaceId: 'default',
    title: 'Two of these lines are one task',
    data: {
      question: 'Should "one" and "two" be one task?',
      options: ['One task.', 'Two tasks.'],
      extra: { delta: { fromDraft: 'draft-taken', ops: [] } },
    },
    actor: AGENT,
  })

  // THE PRODUCT'S OWN MIGRATE PATH. Every SQL migration is already applied, so this runs the data steps.
  first = migrate.migrateInPlace(sqlite)
  firstLog = migrate.describeOutcome(first)
}, 60_000)

/** The drafts table, built by running the migration file that made it, as it stands. */
function makeTheDraftsTable(): void {
  t.client.sqlite.exec(readFileSync(join(REPO, step.THE_FILE_THAT_MADE_THE_DRAFTS_TABLE), 'utf8'))
}

afterAll(() => {
  t.close()
})

function planOf(id: string): Record<string, unknown> | undefined {
  return t.client.sqlite.prepare('SELECT * FROM plans WHERE id = ?').get(id) as Record<string, unknown> | undefined
}
function linesOf(planId: string): { text: string; position: number; record_id: unknown; remark: unknown; updated_at: string; updated_by: string }[] {
  return t.client.sqlite.prepare('SELECT * FROM plan_lines WHERE plan_id = ? ORDER BY position').all(planId) as never
}
function draftsLeft(): { id: string; body: string }[] {
  return t.client.sqlite.prepare('SELECT id, body FROM planning_drafts ORDER BY id').all() as { id: string; body: string }[]
}

describe('migration 0196 moves each rough draft into a plan', () => {
  it('1. turns a non-empty body into its lines exactly, blank lines and trailing white space kept', () => {
    const plan = planOf('draft-shaped')
    expect(plan?.['title']).toBe('ICRA submission — rough')
    expect(plan?.['state']).toBe('open')
    expect(plan?.['read_at']).toBeNull()
    expect(plan?.['created_at']).toBe('2026-08-01 09:00:00')
    expect(plan?.['updated_at']).toBe('2026-08-03 18:15:00')
    const lines = linesOf('draft-shaped')
    expect(lines.map((line) => line.text)).toEqual(SHAPED.split('\n'))
    expect(lines.map((line) => line.text).join('\n')).toBe(SHAPED)
    expect(lines.map((line) => line.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(lines.at(-1)?.text).toBe('')
    for (const line of lines) {
      expect(line.record_id).toBeNull()
      expect(line.remark).toBeNull()
      expect(line.updated_at).toBe('2026-08-03 18:15:00')
    }
  })

  it('2. turns an empty body into a plan with no lines', () => {
    expect(planOf('draft-empty')?.['title']).toBe('Only a title')
    expect(linesOf('draft-empty')).toEqual([])
  })

  it('3. keeps a draft id no plan holds as the plan id, and says it was that draft', () => {
    for (const id of ['draft-shaped', 'draft-empty', 'draft-nobody']) {
      expect(planOf(id)?.['moved_from_draft'], id).toBe(id)
      expect(first.roughDrafts.moved.find((one) => one.draftId === id)?.idKept, id).toBe(true)
    }
  })

  it('4. maps a draft id a plan already holds to a new plan, and a reader finds that plan through the mapping', () => {
    // The plan that always held the id is untouched and is not said to be a draft.
    expect(planOf('draft-taken')?.['title']).toBe('A plan that was always a plan')
    expect(planOf('draft-taken')?.['moved_from_draft']).toBeNull()

    const mapped = first.roughDrafts.moved.find((one) => one.draftId === 'draft-taken')
    expect(mapped?.idKept).toBe(false)
    const newId = mapped?.planId ?? ''
    expect(newId).not.toBe('draft-taken')
    expect(planOf(newId)?.['moved_from_draft']).toBe('draft-taken')
    expect(planOf(newId)?.['title']).toBe('Its id is taken')
    expect(linesOf(newId).map((line) => line.text)).toEqual(['- one', '- two'])

    // THE READER. A proposal that named the draft is advice about the plan it became, not about the plan that
    // happens to hold the draft's old id.
    expect(review.planOfDraft('draft-taken')).toBe(newId)
    const aboutTheMoved = review.readPlanReviews(newId)
    expect(aboutTheMoved.reviews.map((one) => one.alsoNamesDraft)).toEqual(['draft-taken'])
    expect(aboutTheMoved.reviews[0]?.draftBecamePlan).toBe(newId)
    expect(review.readPlanReviews('draft-taken').reviews).toEqual([])
    // And the stored proposal still says what it said: `Delta.fromDraft` is history and is not rewritten.
    const stored = t.client.sqlite
      .prepare("SELECT json_extract(data, '$.extra.delta.fromDraft') AS d FROM records WHERE kind = 'proposal'")
      .get() as { d: string }
    expect(stored.d).toBe('draft-taken')
    // The plan's own context says where it came from.
    expect(review.readPlanContext(newId, { origin: null }).facts.plan.movedFromDraft).toBe('draft-taken')
  })

  it('5. refuses a draft over a plan limit, says why, and keeps it and the table', () => {
    expect(planOf('draft-too-long')).toBeUndefined()
    expect(t.client.sqlite.prepare("SELECT count(*) AS n FROM plans WHERE moved_from_draft = 'draft-too-long'").get()).toEqual({ n: 0 })
    expect(draftsLeft()).toEqual([{ id: 'draft-too-long', body: TOO_LONG }])
    expect(first.roughDrafts.tableDropped).toBe(false)
    const refused = first.roughDrafts.refused
    expect(refused.map((one) => one.draftId)).toEqual(['draft-too-long'])
    expect(refused[0]?.why.join(' ')).toContain('Line 2')
    expect(refused[0]?.why.join(' ')).toContain('over its budget')
  })

  it('6. stamps every moved line with the move and credits no person, and keeps a recorded creator only', () => {
    const lines = t.client.sqlite
      .prepare("SELECT l.updated_by AS by FROM plan_lines l JOIN plans p ON p.id = l.plan_id WHERE p.moved_from_draft IS NOT NULL")
      .all() as { by: string }[]
    expect(lines.length).toBe(12)
    expect(new Set(lines.map((line) => line.by))).toEqual(new Set([step.THE_MOVE]))
    expect(step.THE_MOVE.startsWith('human:')).toBe(false)
    // The draft recorded its creator, so the plan keeps it.
    expect(planOf('draft-shaped')?.['created_by']).toBe(`human:${THE_TEST_OFFICES_OWNER.id}`)
    expect(planOf('draft-empty')?.['created_by']).toBe('agent:orbit')
    // The draft recorded nobody, so the plan names the move and not the office's owner.
    expect(planOf('draft-nobody')?.['created_by']).toBe(step.THE_MOVE)
    expect(first.roughDrafts.moved.find((one) => one.draftId === 'draft-nobody')?.creatorUnrecorded).toBe(true)
    // No line-change ledger row was invented: nobody gave a reason.
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM plan_line_revisions').get()).toEqual({ n: 0 })
  })

  it('7. writes what it moved, what it mapped and what it refused into the migrate log', () => {
    const line = firstLog.split('\n').find((one) => one.startsWith('rough drafts:')) ?? ''
    expect(line).toContain('5 drafts found')
    expect(line).toContain('draft draft-shaped -> plan draft-shaped (id kept, 9 lines')
    expect(line).toContain('draft draft-empty -> plan draft-empty (id kept, 0 lines')
    const newId = first.roughDrafts.moved.find((one) => one.draftId === 'draft-taken')?.planId ?? ''
    expect(line).toContain(`draft draft-taken -> plan ${newId} (NEW ID, a plan already held the draft id, 2 lines`)
    expect(line).toContain(`mapped: draft-taken -> ${newId}`)
    expect(line).toContain(`stamped ${step.THE_MOVE}`)
    expect(line).toContain('1 REFUSED and left in planning_drafts')
    expect(line).toContain('draft draft-too-long "Over the budget": Line 2')
    expect(line).toContain('the planning_drafts table is KEPT')
    expect(line).toContain('--discard <draft id>')
    // And the counts line names the drafts table, with the four that left it for plans.
    expect(firstLog).toContain('planning_drafts 5 -> 1')
  })

  it('8. changes nothing on a second run, and says the refused draft again', () => {
    const plansBefore = t.client.sqlite.prepare('SELECT * FROM plans ORDER BY id').all()
    const linesBefore = t.client.sqlite.prepare('SELECT * FROM plan_lines ORDER BY id').all()
    const second = migrate.migrateInPlace(t.client.sqlite)
    expect(second.roughDrafts.moved).toEqual([])
    expect(second.roughDrafts.refused.map((one) => one.draftId)).toEqual(['draft-too-long'])
    expect(second.roughDrafts.tableDropped).toBe(false)
    expect(t.client.sqlite.prepare('SELECT * FROM plans ORDER BY id').all()).toEqual(plansBefore)
    expect(t.client.sqlite.prepare('SELECT * FROM plan_lines ORDER BY id').all()).toEqual(linesBefore)
    expect(draftsLeft().map((one) => one.id)).toEqual(['draft-too-long'])
    expect(migrate.THE_STEPS.find((one) => one.field === 'roughDrafts')?.wrote(second)).toBe(0)
  })

  it('drops the table once the refused draft is discarded by hand, and says so', () => {
    const said = step.discardADraft(t.client.sqlite, 'draft-too-long')
    expect(said).toContain('Deleted the draft draft-too-long')
    expect(said).toContain(TOO_LONG)
    const third = migrate.migrateInPlace(t.client.sqlite)
    expect(third.roughDrafts.tableDropped).toBe(true)
    expect(migrate.countRows(t.client.sqlite, 'planning_drafts')).toBeNull()
    const fourth = migrate.migrateInPlace(t.client.sqlite)
    expect(fourth.roughDrafts.tableMissing).toBe(true)
    expect(migrate.describeOutcome(fourth)).toContain('rough drafts: there is no planning_drafts table')
  })

  it('refuses to discard a draft that would move, because the move keeps what a hand deletion throws away', () => {
    const scratch = t.client.sqlite
    makeTheDraftsTable()
    scratch
      .prepare(`INSERT INTO planning_drafts VALUES ('draft-fine', 'Fine', 'short', '2026-08-08 09:00:00', '2026-08-08 09:00:00', 'human:${THE_TEST_OFFICES_OWNER.id}')`)
      .run()
    expect(() => step.discardADraft(scratch, 'draft-fine')).toThrow(/meets every plan limit/)
    expect(draftsLeft().map((one) => one.id)).toEqual(['draft-fine'])
    migrate.migrateInPlace(scratch)
    expect(planOf('draft-fine')?.['moved_from_draft']).toBe('draft-fine')
  })
})

describe('the refusals a draft can meet', () => {
  it('refuses a blank title, a title with white space at its ends, and a carriage return, and trims nothing', () => {
    expect(step.whyADraftCannotMove({ title: '   ', body: '' }).join(' ')).toContain('blank')
    expect(step.whyADraftCannotMove({ title: ' Spaced ', body: '' }).join(' ')).toContain('begins or ends with white space')
    expect(step.whyADraftCannotMove({ title: 'Windows', body: 'one\r\ntwo' }).join(' ')).toContain('carriage return')
    expect(step.whyADraftCannotMove({ title: 'Heading', body: '# a heading of far too many words here' }).join(' ')).toContain('Line 1')
    expect(step.whyADraftCannotMove({ title: 'Fine', body: 'a\n\n  b  \n' })).toEqual([])
  })
})
