// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `/api/planning` — when this person will spend real time on work that already exists.
 *
 * ---------------------------------------------------------------------------------------
 * THESE ARE THE ONLY ROUTES IN MOLE OFFICE THAT DO NOT TAKE A WORKSPACE
 * ---------------------------------------------------------------------------------------
 *
 * Every other route in this product starts by asking `workspaceOf(req)`, because every fact Mole Office
 * stores belongs to exactly one project. A plan does not, and that is settled owner semantics rather
 * than an omission here: a planning period is a **person-level time-allocation overlay across
 * workspace-owned canonical work**. A workspace answers *which project owns this work*; planning
 * answers *when will this person allocate real time to it*. One week holds Mole Office work,
 * greenhouse work and a dentist appointment, and sending `x-mole-office-workspace` at these routes would be asking
 * a question they do not have an answer to.
 *
 * WHAT THAT DOES NOT MEAN. It is not a way to read another project. The rule is in
 * `lib/planning.ts` and it is kept by construction: the only records these routes ever read are the
 * ones the plan already names, fetched by primary key. There is no listing, no filter and no search
 * here that ranges over a workspace. Every row that comes back says which project owns it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE REPLY IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * One request answers the whole of "what does this period look like": what is planned, how much of
 * it is stated in hours, how many hours the period holds, whether it fits, and — for a month or a
 * week — how much of the plan has been placed on the finer periods inside it. That is deliberately
 * one round trip, because a surface that had to make five would show four of them and then a
 * spinner.
 *
 * Every total says how many rows it could not count. An allocation with no hours on it is normal and
 * honest, so "6 hours planned" over four allocations means something different depending on whether
 * all four said a number.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DeadlineOutlook } from '@shared/deadlines.ts'
import { progressOf } from '@shared/work.ts'
import type { RecordKind } from '@shared/types.ts'
import {
  fitOf,
  loadOf,
  parsePeriod,
  periodKey,
  sharesOf,
  spreadOf,
  windowDays,
  type Fit,
  type Grain,
  type Load,
  type Share,
  type Spread,
  type Allocation,
  type WorkWindow,
} from '@shared/planning.ts'
import { GRAINS } from '@shared/planning.ts'
import { EVERY_PROJECT, PROJECTS_QUERY } from '@shared/across-projects.ts'
import { sayItWasDoneFromAnotherComputer } from '../lib/changed-from-another-computer.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import {
  ALLOCATABLE_KINDS,
  allocationsCovering,
  allocationsIn,
  capacityOf,
  createAllocation,
  deleteAllocation,
  hoursCountedTwiceIn,
  patchAllocation,
  resolveAllocated,
  withWork,
  type AllocatedWork,
  type AllocationWithWork,
  type Capacity,
} from '../lib/planning.ts'
import {
  createWindow,
  deleteWindow,
  patchWindow,
  windowsOverlapping,
  withWork as windowsWithWork,
} from '../lib/windows.ts'
import { aRaiseCarriesIt, assertThePersonIsProved } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { allocationStamps, windowStamps } from '../lib/planstamps.ts'
import { theProjectsAQueryAsks } from '../lib/across-projects.ts'
import { theMessageReader } from '../lib/messages.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { route } from '../lib/route.ts'

/** What a period looks like, in one reply. */
export interface PlanReply {
  horizon: Grain
  period: string
  /** The local days this period covers, both ends included. Computed, never stored. */
  from: string
  to: string
  /** Every allocation in it, each with the work it names — or `null` where that record is gone. */
  entries: AllocationWithWork[]
  /** Hours available, or `null` when nobody has said. Null is not zero and not a full week. */
  capacity: Capacity | null
  /**
   * The arithmetic: what this period costs, the capacity, what is left, and how many rows gave no
   * number.
   *
   * `fit.load.countedTwice` is this period's containment reading, and it is never null here: these
   * routes always read the period. `fit.load.envelopes` is that reading arranged as trees, so a
   * piece of work planned at two levels costs the period its envelope and not the sum of the rows.
   */
  fit: Fit
  /**
   * For a month or a week: how much of what this period planned has been placed on the finer
   * periods inside it, per record. `null` for a day, which has nothing finer.
   *
   * NOT A SUM ACROSS GRAINS. A week planning 8 hours with 3 on a Monday is 8 hours of work.
   */
  spread: Spread[] | null
  /**
   * THE SAME PERIOD, ONE HORIZON FINER: a row per week inside a month, or per day inside a week.
   *
   * `spread` above answers "how much of what this period committed has reached a finer period", per
   * RECORD. This answers the other half — WHICH finer periods hold anything — and it exists because
   * a month page could not draw its own weeks without it. Measured on 2026-08-13: `2026-08` reported
   * "0 hours planned" while ten hours sat in `2026-W33` inside it, and the reply carried no number
   * the page could have used to say so.
   *
   * It is `loadOf` per period over the SAME allocations `spread` reads, so the two cannot disagree,
   * and it is NEVER added to this period's own total — a week's hours and the month's are two
   * answers to two questions. `null` for a day, which has nothing finer.
   */
  finer: Load[] | null
  /**
   * The kinds a plan may give time to, from the ONE declaration `createAllocation` enforces.
   *
   * Sent so that a browser can stop drawing a press the server will refuse. It was drawing one on
   * every search result — a session, a message, a proposal — and the refusal arrived after the
   * press. The alternative is a list of kinds written down in the browser too, which is the pair
   * this repository keeps finding: `lib/planning.ts` gains a kind and the page goes on refusing it.
   */
  allocatableKinds: readonly RecordKind[]
  /**
   * Work the SPREAD names that this period's own allocations do not.
   *
   * The spread is computed over the finer periods inside this one, so a record with time on a
   * Tuesday and none on the week appears there and in no entry — and the page had nothing to call it
   * but its id. At the month horizon, where a month usually has no allocations of its own, that was
   * every row: three lines each reading like a record called `PiQzVdq42ufa`. Found by driving the
   * product, twice, by two different agents.
   *
   * Resolved BY PRIMARY KEY like everything else here, and kept beside `entries` rather than merged
   * into them: an entry is an allocation this period made, and one of these is not.
   */
  alsoNamed: AllocatedWork[]
  /**
   * 6D — where this period's hours go, by the project that owns the work.
   *
   * The single-person constraint, which is the one thing no project can see for itself: three
   * green weeks in three workspaces can add up to an impossible one. The groups are the SAME rows
   * `fit` counts, so the parts add up to the whole — asserted in tests/planning-shares.test.ts
   * rather than promised here.
   */
  shares: Share[]
  /** What this reply is, in words, including the two cases that are not "no". */
  note: string
}

/**
 * What ONE DEADLINE looks like, in one reply.
 *
 * DECLARED HERE AND IMPORTED BY THE BROWSER, exactly as `PlanReply` above is. The arithmetic is
 * `DeadlineOutlook` from shared/deadlines.ts and this does not restate a field of it: a second
 * hand-written copy in src/web/api.ts would be the defect CLAUDE.md names, and it would go stale the
 * first time a gap or a count was added to the report.
 */
export interface DeadlineReply {
  /** Which record this deadline is on, so a surface can name it without a second read. */
  record: { id: string; kind: RecordKind; title: string; workspaceId: string }
  /**
   * What the caller named in `?work=`, and what of it this reply could not find.
   *
   * An id no record answers to used to be filtered out in silence, so a total covering three of
   * four named records was drawn as though it covered four. `missing` is the answer, given once,
   * where the ids were read.
   */
  named: { asked: number; sized: number; missing: string[] }
  /** The whole report, with every input it could not count named in `gaps`. */
  outlook: DeadlineOutlook
  note: string
}

const grainParam = z.strictObject({
  horizon: z.enum(GRAINS, { error: `horizon must be one of: ${GRAINS.join(', ')}` }),
  period: z.string().min(1),
})

const newAllocation = z.strictObject({
  horizon: z.enum(GRAINS, { error: `horizon must be one of: ${GRAINS.join(', ')}` }),
  period: z.string({ error: 'period is required: 2026-09, 2026-W36 or 2026-09-07' }).min(1),
  recordId: z.string({ error: 'recordId is required: the work this time is for' }).min(1),
  /**
   * Absent and `null` are the same answer and both are allowed: somebody planned to work on this
   * without saying for how long. NOTHING fills it in from the record's `effort_hours`.
   */
  plannedHours: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
})

const allocationPatch = z
  .strictObject({
    plannedHours: z.number().nullable().optional(),
    actualHours: z.number().nullable().optional(),
    state: z.string().optional(),
    note: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: 'Send at least one field to change.' })

const capacityBody = z.strictObject({
  hours: z.number({ error: 'hours is required: how many hours this period holds' }),
  note: z.string().nullable().optional(),
})

const DAY = 'a day, written like 2026-09-07'

const windowRange = z.strictObject({
  from: z.string({ error: `from is required: ${DAY}` }).min(1),
  to: z.string({ error: `to is required: ${DAY}` }).min(1),
  /** `?projects=`, read by `theProjectsAQueryAsks` below; named here so the strict shape lets it in. */
  [PROJECTS_QUERY]: z.unknown().optional(),
})

/**
 * OF THESE ROWS OF THE PLAN, THE ONES WHOSE WORK IS IN THE PROJECTS ASKED FOR, which the Goals page
 * needs. A window or a line names its work by id, and the work's own record says its
 * project. A row whose work record is gone altogether names no project: it is kept when every
 * project is asked for, because nothing is narrowed then, and left out when one project is.
 */
function inTheProjectsAsked<T extends { work: { workspaceId: string } | null }>(
  rows: readonly T[],
  projects: readonly { id: string }[],
  every: boolean,
): T[] {
  const ids = new Set(projects.map((project) => project.id))
  return rows.filter((row) => (row.work === null ? every : ids.has(row.work.workspaceId)))
}

/** Whether `?projects=` asked for every project, rather than for one. */
function askedEveryProject(query: unknown): boolean {
  const asked = (query as Record<string, unknown>)[PROJECTS_QUERY]
  return typeof asked === 'string' && asked.trim() === EVERY_PROJECT
}

const newWindow = z.strictObject({
  recordId: z.string({ error: 'recordId is required: the work this window is about' }).min(1),
  startsOn: z.string({ error: `startsOn is required: ${DAY}` }).min(1),
  endsOn: z.string({ error: `endsOn is required: ${DAY}` }).min(1),
  /** What to know when you come back to this block. Absent and null both mean nobody wrote one. */
  note: z.string().nullable().optional(),
})

const windowPatch = z
  .strictObject({
    /** Send both to MOVE the window; send one to STRETCH it. Either way both ends are checked. */
    startsOn: z.string().min(1).optional(),
    endsOn: z.string().min(1).optional(),
    note: z.string().nullable().optional(),
    /**
     * A STRING HERE, AND THE WORDS ARE CHECKED IN `patchWindow`, exactly as an allocation's state is.
     *
     * An enum in this schema would be the same rule in two places, and the one in the library is the
     * one that has to hold: a caller reaching `patchWindow` directly must be refused too. Written as
     * an enum here, the library's check became unreachable and untested — measured by mutating it on
     * 17 August 2026 and watching nothing go red.
     */
    state: z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: 'Send at least one field to change.' })

const WINDOW_NOTE =
  'WHEN SOMEBODY MEANS TO WORK ON SOMETHING: a first day and a last day, both included. A WINDOW ' +
  'CARRIES NO HOURS AND ENTERS NO TOTAL — it answers when, not how much, and nothing in this product ' +
  'adds it into a week, into capacity, or into anything read as time committed. Hours stay the ' +
  'allocation\'s job. That is what makes it possible to place work across a span — "this Thursday to ' +
  'next Wednesday" — without first working out how many hours belong on each day. FOUR DIFFERENT ' +
  'FACTS AND THIS IS ONE: the estimate (`effort_hours` on the record) is how big the work is, the ' +
  'window is when you mean to do it, an allocation is how many hours a period gives it, and a ' +
  'deadline is when it must be finished. A task may have all four, or a window and nothing else. ' +
  'TWO COLUMNS HERE WHERE AN ALLOCATION HAS ONE PERIOD KEY, because a window may run from a Thursday ' +
  'to the following Wednesday and no period key can name that. GET /api/planning/windows?from=&to= ' +
  'lists every window that OVERLAPS those days — one that started earlier or ends later is still on ' +
  'the board. POST creates one. PATCH moves it (send both days), stretches it (send one), writes its ' +
  'note, or says what became of it; COMPLETING A WINDOW COMPLETES THAT SPAN AND NOTHING ELSE, never ' +
  'the work it names. DELETE takes it off the schedule and leaves the work and any hours alone. ' +
  'SEVERAL WINDOWS ON ONE PIECE OF WORK ARE ORDINARY and overlapping ones are allowed: two spans are ' +
  'two facts, unlike two rows of hours in one period, which is why that one is refused and this is ' +
  'not. THESE ROUTES TAKE NO WORKSPACE, like the rest of planning: a person\'s week holds work from ' +
  'every project, and a window grants no authority to read the project its record lives in.'

/**
 * A DROPPED LINE. One more reading of planned against actual: time somebody decided would not
 * happen, which `shared/planning.ts` says is different from a line left planned.
 */
const DROPPED_LINES_NOTE =
  'A LINE OF THE PLAN THAT WAS DROPPED: an allocation whose state is `dropped`, in a span of days. ' +
  'GET /api/planning/dropped-lines?from=&to= lists every allocation whose period falls in those days ' +
  'and whose state is dropped, with the work it named and the stamp saying whose line it is. A line ' +
  'left `planned` at the end of its period is NOT dropped: nobody said what became of it. These ' +
  'routes take no workspace, like the rest of planning.'

export const PLANNING_ROUTE_NOTE =
  'What this person will spend time on, and when: GET /api/planning/<month|week|day>/<period>, where a ' +
  'period is 2026-09, 2026-W36 (ISO-8601, Monday first) or 2026-09-07. A period may also be the word ' +
  '`current`, which the server resolves to the period its own clock is in, so a caller that wants now does ' +
  'not have to work the period out from a browser clock: GET /api/planning/week/current. THESE ROUTES TAKE NO WORKSPACE and ' +
  'that is deliberate: a plan is a person-level overlay across work that each stay in their own project, so ' +
  'one week holds Mole Office work, greenhouse work and a dentist appointment at once. It is not a way to read ' +
  'another project — the only records read are the ones the plan already names, by id, and every row says ' +
  'which project owns it. The reply carries the allocations with their work, the hours the period holds, the ' +
  'arithmetic, and for a month or week how much of the plan has been placed on the days inside it. TWO ' +
  'DIFFERENT NUMBERS: `effort_hours` on the record is how big the work is in total; `plannedHours` on an ' +
  'allocation is how much time this period gives it. They never disagree, because they answer different ' +
  'questions, and they are NEVER added across horizons. A PIECE OF WORK AND THE PARTS OF IT MAY BOTH HOLD ' +
  'HOURS IN ONE PERIOD, which is how coarse-to-fine planning works: 15 hours on a large piece of work, then ' +
  '5 and 4 on parts of it. THE PERIOD THEN COSTS 15 AND NEVER 24. The hours on the highest allocated piece ' +
  'of work are an envelope, the hours below explain part of it, and `fit.load.envelopes` carries every tree ' +
  'with its envelope, what is assigned inside it and what is not yet broken down. `fit.load.plannedHours` ' +
  'counts each tree once; `fit.load.rowHours` is the plain sum of the rows, and the two differ exactly when ' +
  'a period plans at two levels. WHEN THE PARTS EXCEED THE ENVELOPE that is a real conflict: it is SHOWN as ' +
  '`overAssignedByHours` and the tree then costs the larger number, because pretending the parts fit would ' +
  'be the arithmetic lying. `envelopes.couldNotPlace` names every row whose containment could not be read, ' +
  'and such a row is counted on its own rather than guessed into a tree. `fit.load.countedTwice` is the ' +
  'containment reading the arithmetic was built on; `countedTwice: null` would mean nobody looked, and ' +
  'these routes always look. plannedHours may be null, meaning somebody committed ' +
  'to the work here without saying how long for — it is never filled in from the estimate. Capacity is null ' +
  'until somebody sets it and null is not a full working week. POST /api/planning/allocations gives work ' +
  `time (kinds: ${ALLOCATABLE_KINDS.join(', ')}); PATCH one to change or complete it — COMPLETING AN ` +
  'ALLOCATION COMPLETES THAT SLICE OF TIME AND NOTHING ELSE, never the work it names, so partial work can ' +
  'span days truthfully. PUT /api/planning/capacity/<horizon>/<period> says how many hours a period holds — ' +
  'leaving `note` out KEEPS the note already stored, and sending null clears it, because a caller that said ' +
  'nothing about the label did not ask for it to be deleted. DELETE the same path to take the answer back ' +
  'altogether, which is how a period returns to nobody having said — not to zero. ' +
  'GET/POST /api/planning/intents keeps what a person WROTE about time, exactly as they wrote it, with an ' +
  'interpretation beside it only when one could be made honestly — and nothing but a committed intent ever ' +
  'enters arithmetic.'

/**
 * FOUR ROUTES IN THIS REGION DO SOMETHING THE REGION NOTE DOES NOT DESCRIBE, so they carry their
 * own line. `GET /api` promises that every endpoint says what IT is for and what ITS reply carries;
 * a shared paragraph about planning answers that for `GET /planning/week/2026-W36` and for nothing
 * else. An agent reading the index to find how to apply an approved change set would not find it.
 */
const TODAY_NOTE =
  'WHAT TODAY HOLDS: the day allocations, the hours the day was given, the arithmetic over them, and the ' +
  "recurring commitments that fall today. Recurrences are OFFERED, NOT WRITTEN — the reply lists what " +
  'recurs today so a person can allocate it; nothing materialises rows on a schedule behind them, so an ' +
  'unallocated recurrence is never mistaken for a commitment somebody made.'

const DEADLINE_NOTE =
  'WHAT ONE DEADLINE LOOKS LIKE, as deterministic arithmetic over stored rows: the deadline itself, time ' +
  'remaining, estimated relevant work, how much of it is planned, how much is unplaced, the capacity in ' +
  'between and the buffer that leaves. WHICH WORK IS RELEVANT IS THE CALLER\'S ANSWER — send ' +
  '?work=<id>,<id> — because an obligation cannot say what it depends on (`blocked_by` is free text) and a ' +
  'rule that read prose to decide would be a rule prose can fool. ?horizon=<month|week|day> chooses the ' +
  'grain capacity is read at. Every unknown comes back as a named gap rather than as a zero, and NOTHING ' +
  'HERE TURNS WORDS INTO A DATE: an obligation owed on a condition has no window, so every windowed number ' +
  'is null and `no-date` is beside it. Reading a vague phrase as a date is a separate act a person commits to.'

const REVIEW_NOTE =
  'THE FACTS A REVIEW OF A PAST WEEK OR MONTH IS MADE OF, and no judgement about it. The reply carries what ' +
  'was allocated and what became of each slice — done, deliberately dropped, and PLANNED, which at the end ' +
  'of a period means intended and nobody said what became of it — plus work that had time here and is still ' +
  'unfinished, read off the WORK\'s own state rather than off the allocation, because completing a slice ' +
  'never completed the work. Every total says how many rows it could not count, and whether any of its ' +
  'hours are one piece of work counted twice (`load.countedTwice`, which names both ends of each pair and ' +
  'changes no number). No narrative, no ' +
  'recommendation, no verdict on whether the period went well: an agent may critique this and a person decides.'

const APPLY_NOTE =
  'APPLY AN APPROVED CHANGE SET to the project — the one route in this region that writes canonical records. ' +
  'It takes the delta on a proposal (`data.extra.delta`) and makes it, ALL OF IT IN ONE TRANSACTION, so half ' +
  'a change set can never be applied. It refuses four things: an actor who is neither an explicitly stated ' +
  "human nor a secretary holding the owner's grant where this office's list of what the grant carries says so " +
  '(403 — silence is not evidence of a person), a fork no HUMAN has settled by promoting the proposal (409), ' +
  'a delta carrying an `unresolved` operation, and any operation whose record has changed since it was ' +
  'proposed. A refusal names WHICH operation stopped it and leaves the project exactly as it was.'

const INTENT_NOTE =
  'WHAT A PERSON WROTE ABOUT TIME, KEPT EXACTLY AS THEY WROTE IT. The owner\'s rule: humans express ' +
  'intent, agents and parsers translate it, and Mole Office validates and commits it. So `said` is stored byte ' +
  'for byte and is never parsed away, and `period`, `horizon` and `hours` beside it are what Mole Office made ' +
  'of those words — EMPTY WHEN NOTHING COULD BE MADE HONESTLY. "Tuesday afternoon" has a defensible ' +
  'reading and "sometime next week" does not, and Mole Office never turns the second into a date to be ' +
  'consistent with the first. `state` is one of three: `kept` (the words are stored and nothing was ' +
  'interpreted), `offered` (an interpretation was made and waits for a person), `committed` (it became an ' +
  'allocation). NOTHING BUT `committed` EVER ENTERS ARITHMETIC — a kept intent adds to no week, uses no ' +
  'capacity and counts as no work planned, and every total in this product reads `allocations` and reads ' +
  'nothing here. POST /api/planning/intents/<id>/commit is the only way from words to a canonical row, and ' +
  'it goes through the same validation every allocation has always gone through: the same kinds, the same ' +
  'period check, the same hours check, and the same one-allocation-per-record-per-period rule. There is no ' +
  'other door and an agent does not get one. `record_id` and `plan_line_id` are both optional, and the ' +
  'second matters: somebody may write time on a plan line before that line is filed as work, so an intent ' +
  'can belong to a line and to no record at all. Such an intent cannot be committed, and the refusal says ' +
  'so rather than inventing something for the hours to point at. ' +
  'ONE PLAN LINE HOLDS ONE ANSWER ABOUT TIME. Writing words for a line REPLACES what that line last said ' +
  'about time instead of adding a second row beside it, and `replaced` in the reply names exactly what was ' +
  'taken away. A line said one phrase twice with two different readings before this rule existed — the same ' +
  '"next week" read as two different weeks, drawn together, with no way to remove either. A committed ' +
  'intent is never replaced: it is where an allocation came from. An intent that names no line is left ' +
  'alone, because the line is what makes two writes the same write. DELETE /api/planning/intents/<id> is ' +
  'how a person takes kept words off a line, and it refuses a committed one and says to remove the hours ' +
  'instead.'

const newIntent = z.strictObject({
  said: z.string({ error: 'said is required: the words somebody wrote, exactly as they wrote them' }).min(1),
  /** The work this is about. Absent is ordinary: a plan line may hold time before it is filed. */
  recordId: z.string().nullable().optional(),
  planLineId: z.string().nullable().optional(),
  /**
   * The interpretation, when the caller already has one — a person speaking the canonical form, or an
   * agent. Left out, the words are read for it, and nothing is invented when they cannot be read.
   */
  period: z.string().nullable().optional(),
  hours: z.number().nullable().optional(),
})

const intentQuery = z.strictObject({
  /** Only the intents about one record, or the ones written on one plan line. */
  record: z.string().optional(),
  line: z.string().optional(),
})

export async function planningRoutes(app: FastifyInstance): Promise<void> {
  /**
   * INTENTS — what a person wrote about time, before any of it is a fact.
   *
   * Writing here makes no allocation, uses no capacity and moves no total. The words are kept, an
   * interpretation is offered beside them when one can be made honestly, and a person decides.
   */
  app.get('/planning/intents', route('plan.read', 'remote', INTENT_NOTE), async (req) => {
    const query = parse(intentQuery, req.query, 'The query string is not usable:')
    const { listIntents, periodReadingOfIntent } = await import('../lib/planning.ts')
    const intents = listIntents({
      ...(query.record === undefined ? {} : { recordId: query.record }),
      ...(query.line === undefined ? {} : { planLineId: query.line }),
    }).map((intent) => ({ ...intent, periodReading: periodReadingOfIntent(intent) }))
    const committed = intents.filter((i) => i.state === 'committed').length
    const waiting = intents.filter((i) => i.state === 'offered').length
    const kept = intents.filter((i) => i.state === 'kept').length
    return {
      intents,
      counts: { all: intents.length, kept, offered: waiting, committed },
      note:
        intents.length === 0
          ? 'Nobody has written anything about time here. That is not the same as nothing being planned: ' +
            'hours given straight to a week leave no intent behind.'
          : `${intents.length} written, newest first: ${kept} kept as words with no period assigned, ` +
            `${waiting} with an interpretation waiting for you, ${committed} already scheduled. ` +
            'ONLY THE COMMITTED ONES ARE IN ANY TOTAL. The other ' +
            `${kept + waiting} add nothing to a week and use no capacity.`,
    }
  })

  app.get('/planning/intents/:id', route('plan.read', 'remote', INTENT_NOTE), async (req) => {
    const { id } = parse(z.strictObject({ id: z.string().min(1) }), req.params, 'That is not an intent id:')
    const { getIntent, periodReadingOfIntent } = await import('../lib/planning.ts')
    const intent = getIntent(id)
    if (intent === null) throw new PanelError(`No intent has the id "${id}".`, 404)
    return { intent: { ...intent, periodReading: periodReadingOfIntent(intent) } }
  })

  app.post('/planning/intents', route('plan.write', 'remote', INTENT_NOTE), async (req, reply) => {
    const body = parse(newIntent, req.body, 'That is not something Mole Office can keep:')
    const { createIntent } = await import('../lib/planning.ts')
    const made = createIntent(body, actorFrom(req))
    reply.code(201)
    // WHAT THIS WRITE TOOK AWAY. A line holds one answer about time, so writing one takes the old
    // one off, and a person who is not told that cannot tell a replacement from a second row they
    // now have to go and find.
    const replaced =
      made.replaced.length === 0
        ? ''
        : ` This line said ${made.replaced.map((one) => `"${one.said}"`).join(' and ')} about time before, ` +
          'and that has been replaced.'
    return {
      ...made,
      /**
       * WHAT A PERSON READS AFTER PRESSING "KEEP THESE WORDS". Two short plain sentences, and no
       * word in capitals.
       *
       * This used to be the paragraph that is now `detail`, shouted in the middle, and the browser
       * printed all of it into the plan table under the row. The owner read it there on 16 August
       * 2026 and their rule for it is the same one they set for the filing receipt: say what happened,
       * and let the long account live where a developer view can find it. Both are built from the
       * fields of one reply, so the short one cannot come to say something the long one does not.
       */
      note:
        'Your words are kept as you typed them. Nothing was scheduled from them.' +
        // A PERIOD IS STORED BESIDE THEM, and saying so must not claim Mole Office read one: in the
        // table's hours box the period came from a button somebody pressed, and only in the when
        // box could it have been read out of the words. Both arrive here as one field.
        (made.intent.state === 'offered' ? ' The period beside them counts only when you commit it.' : '') +
        replaced,
      detail:
        'Nothing was scheduled from these words: no allocation was made, no capacity was used, and no ' +
        'total moved. ' +
        (made.intent.state === 'offered'
          ? 'An interpretation is offered beside them, and it becomes real only when somebody commits it.'
          : 'Mole Office read no period from them and did not invent one.') +
        (made.replaced.length === 0
          ? ''
          : ' It replaced what this line said about time before: ' +
            `${made.replaced.map((one) => `${JSON.stringify(one.said)} (${one.id})`).join(' and ')}.`),
    }
  })

  /**
   * TAKE KEPT WORDS OFF A LINE. The way out, beside the way in.
   *
   * A surface that can write a thing and cannot remove it leaves a person stuck with whatever is
   * there — which is what the duplicate rows measured on 16 August 2026 left the owner with. The refusal
   * on a committed one is in `deleteIntent` and says what to remove instead.
   */
  app.delete('/planning/intents/:id', route('plan.write', 'remote', INTENT_NOTE), async (req) => {
    const { id } = parse(z.strictObject({ id: z.string().min(1) }), req.params, 'That is not an intent id:')
    const { deleteIntent } = await import('../lib/planning.ts')
    const gone = deleteIntent(id)
    return {
      intent: gone,
      note:
        `"${gone.said}" is gone. Nothing else changed: no hours were given or taken away, because words ` +
        'that were never committed were never in any total.',
    }
  })

  app.post('/planning/intents/:id/commit', route(
      'plan.write',
      'local',
      // The person may commit from a paired computer with their own key: it writes rows.
      { because: 'reserved-to-the-owner', act: 'Turning words about time into hours on your calendar', thePersonMayFromAnotherComputer: true },
      INTENT_NOTE,
    ), async (req, reply) => {
    const { id } = parse(z.strictObject({ id: z.string().min(1) }), req.params, 'That is not an intent id:')
    const { commitIntent } = await import('../lib/planning.ts')
    const done = commitIntent(id, actorFrom(req))
    sayItWasDoneFromAnotherComputer(req, 'Words about time were committed as hours on your calendar')
    reply.code(201)
    return {
      ...done,
      note:
        `${done.note} This went through the same validation every allocation goes through: the same kinds, ` +
        'the same period check, the same hours check, and the same rule that one piece of work has one ' +
        'allocation in one period. There is no other way into the canonical rows.',
    }
  })

  app.get('/planning/:horizon/:period', route('plan.week', 'remote', PLANNING_ROUTE_NOTE),
    async (req): Promise<PlanReply> => {
    const { horizon, period: asked } = parse(grainParam, req.params, 'That is not a period this can read:')
    // THE DOOR TAKES THE DATE. `current` is the server's own clock answering "which week is it" so a
    // browser never works that out for itself and never has to wait for `/planning/today` before it
    // can ask about the week. See `periodKey`, the one place that works a period out.
    const period = asked === 'current' ? periodKey(horizon, new Date()) : asked
    const parsed = parsePeriod(period)
    if (parsed === null || parsed.horizon !== horizon) {
      throw new PanelError(
        `"${period}" is not a ${horizon}. A month is 2026-09, a week is 2026-W36 (ISO-8601, Monday first), ` +
          `a day is 2026-09-07.`,
      )
    }

    const mine = allocationsIn(horizon, period)
    const entries = withWork(mine)
    const capacity = capacityOf(horizon, period)
    // THE TOTAL SAYS WHETHER ANYBODY LOOKED FOR HOURS COUNTED TWICE. Without this argument `loadOf`
    // answers `countedTwice: null`, which means "nobody read this period's containment" — honest,
    // but it is the answer every surface in the running product was getting, so no total anywhere
    // could say whether it held a piece of work and a part of that same work.
    //
    // IT CHANGES NO NUMBER. `loadOf` adds the same rows either way; what arrives is the note beside
    // the sum. `tests/planning-counted-twice.test.ts` asserts the two loads are equal in every other
    // field, and the test added below asserts it through this route.
    const load = loadOf(horizon, period, mine, hoursCountedTwiceIn(horizon, period))
    const fit = fitOf(load, capacity?.hours ?? null)
    // The work each row names has already been fetched by primary key, so the owner is read off it
    // rather than queried for. `null` where the record is gone — that row is a fact about the plan
    // and is grouped, not dropped.
    const shares = sharesOf(
      horizon,
      period,
      entries.map((e) => ({ allocation: e.allocation, owner: e.work?.workspaceId ?? null })),
    )

    // For a month or a week, how much of the plan has reached the days inside it. A month looks at
    // weeks, a week looks at days: one step finer, because a month reading days as well would count
    // the same hour under two headings.
    const finerGrain: Grain | null = horizon === 'month' ? 'week' : horizon === 'week' ? 'day' : null
    // ONE READ, TWO ANSWERS. The spread (per record) and the finer loads (per period) are computed
    // over the same rows, so a month cannot report ten hours in its weeks under one heading and none
    // under the other.
    const covering = finerGrain === null ? [] : allocationsCovering(parsed.from, parsed.to)
    const spread = finerGrain === null ? null : spreadOf(parsed, finerGrain, covering)
    const finer =
      finerGrain === null
        ? null
        : [...new Set(covering.filter((a) => a.horizon === finerGrain).map((a) => a.period))]
            .sort()
            // EACH FINER PERIOD IS READ FOR ITSELF. A week inside a month is its own question, and
            // handing one period's reading to another period's total is refused by `loadOf` rather
            // than accepted — a note naming the wrong week is worse than no note.
            .map((key) => loadOf(finerGrain, key, covering, hoursCountedTwiceIn(finerGrain, key)))

    // The names the spread needs and the entries do not carry. See `alsoNamed`.
    const known = new Set(entries.map((e) => e.allocation.recordId))
    const extra = [...new Set((spread ?? []).map((row) => row.recordId))].filter((id) => !known.has(id))
    const alsoNamed =
      extra.length === 0
        ? []
        : [...resolveAllocated(extra.map((id) => ({ recordId: id }) as Allocation)).values()]

    const unstated = fit.unstated
    // WHAT THE FINER PERIODS HOLD, from the SAME `finer` rows sent beside this sentence. A month with
    // nothing on it and ten hours in its weeks used to say only "Nothing is planned", while the same
    // reply carried the ten hours (problem 4Eg6N1On0O2w). Each finer load is added once: a week and a
    // week are two periods, not one period at two levels, so the envelope rule does not apply across
    // them. They are still never added to this period's own total.
    const finerRows = (finer ?? []).reduce((sum, one) => sum + one.allocations, 0)
    const finerHours = (finer ?? []).reduce((sum, one) => sum + one.plannedHours, 0)
    const finerUnstated = (finer ?? []).reduce((sum, one) => sum + (one.allocations - one.stated), 0)
    const nothingHereOrFiner = mine.length === 0 && finerRows === 0
    const note =
      nothingHereOrFiner
        ? `Nothing is planned for ${period} yet. That is not the same as a period with no time in it: ` +
          (capacity === null
            ? `${period}'s hours are not set either.`
            : `it holds ${capacity.hours} hours and all of them are free.`)
        : mine.length === 0
          ? `Nothing is planned for ${period} itself, but the ${finerGrain}s that overlap it hold ` +
            `${finerRows} allocation${finerRows === 1 ? '' : 's'}, ${finerHours} hour${finerHours === 1 ? '' : 's'} planned` +
            (finerUnstated === 0
              ? ''
              : `, and ${finerUnstated} of them ${finerUnstated === 1 ? 'does' : 'do'} not say how long`) +
            `. Those hours are in \`finer\` and are not added to ${period}'s own total. ` +
            (capacity === null
              ? `${period}'s hours are not set.`
              : `${period} holds ${capacity.hours} hours, and none of them is given to ${period} itself.`)
        : `${mine.length} allocation${mine.length === 1 ? '' : 's'} in ${period}, ` +
          `${load.plannedHours} hour${load.plannedHours === 1 ? '' : 's'} planned` +
          (unstated === 0
            ? ' and every one of them says how long'
            : `, but ${unstated} of them ${unstated === 1 ? 'does' : 'do'} not say how long — so the total is a ` +
              `floor, not the whole`) +
          '. ' +
          // THE TWO NUMBERS DIFFER EXACTLY WHEN THIS PERIOD PLANS AT TWO LEVELS, and a person seeing
          // 15 above rows that add to 24 has to be told why without opening anything.
          (load.envelopes !== null && load.envelopes.trees.length > 0
            ? `${load.envelopes.trees.length} of those ${load.envelopes.trees.length === 1 ? 'is a piece of work with parts of it planned inside it' : 'are pieces of work with parts of them planned inside them'}. ` +
              `Each one costs this period its own hours and not the sum: ${load.envelopes.assignedHours} ` +
              `hour${load.envelopes.assignedHours === 1 ? ' is' : 's are'} assigned to named parts and ` +
              `${load.envelopes.notYetBrokenDownHours} ${load.envelopes.notYetBrokenDownHours === 1 ? 'is' : 'are'} ` +
              `not yet broken down. The rows themselves add up to ${load.rowHours}. `
            : '') +
          (capacity === null
            ? // THE WAY OUT IS THE PRESS THAT DOES IT. This ended with the route that sets a
              // capacity, and this sentence is drawn on the period's own page, under a button
              // reading "Set week capacity". The route is still published in the region note above,
              // where an agent looks for it.
              `${period}'s hours are not set, so there is no answer to whether it fits. ` +
              `"Set ${horizon} capacity" on this period says.`
            : fit.overcommitted === true
              ? `It holds ${capacity.hours}, so it is over by ${Math.abs(fit.freeHours ?? 0)}.`
              : `It holds ${capacity.hours}, so ${fit.freeHours} ${fit.freeHours === 1 ? 'hour is' : 'hours are'} free.`)

    return {
      horizon,
      period,
      from: parsed.from,
      to: parsed.to,
      entries,
      capacity,
      fit,
      spread,
      finer,
      allocatableKinds: ALLOCATABLE_KINDS,
      alsoNamed,
      shares,
      note,
    }
  })

  /**
   * Today, without the caller having to know what today is.
   *
   * The date comes from the server's local clock, which is the same clock every stamp in Mole Office is
   * written with — an agent computing "today" from a UTC instant is how a day boundary gets read
   * wrong by the machine's offset, and this product has already paid for that once.
   */
  app.get('/planning/today', route('plan.week', 'remote', TODAY_NOTE), async () => {
    const now = new Date()
    const day = periodKey('day', now)
    const week = periodKey('week', now)
    const month = periodKey('month', now)
    const { allocationsIn, capacityOf, withWork, dueOn, listRecurrences } = await import('../lib/planning.ts')
    const { resolveAllocated } = await import('../lib/planning.ts')

    const today = withWork(allocationsIn('day', day))
    const recurring = dueOn(day, listRecurrences())
    // The work each recurrence names, by id — the same by-primary-key read the rest of the planning
    // layer uses, so a routine cannot become a way to browse a project.
    const recurringWork = resolveAllocated(
      recurring.map((r) => ({
        id: r.id,
        horizon: 'day' as const,
        period: day,
        recordId: r.recordId,
        plannedHours: r.hoursEach,
        actualHours: null,
        state: 'planned' as const,
        note: null,
        createdAt: '',
        updatedAt: '',
      })),
    )
    // A ROUTINE THAT IS ALREADY ON TODAY IS NOT OFFERED TWICE. Its occurrence is an ordinary
    // allocation, so once it exists the recurrence has nothing left to suggest.
    const alreadyPlanned = new Set(today.map((e) => e.allocation.recordId))

    return {
      day,
      week,
      month,
      allocations: today,
      capacity: capacityOf('day', day),
      /** What comes round today and has not been put on it yet. Suggestions, never written. */
      recurring: recurring
        .filter((r) => !alreadyPlanned.has(r.recordId))
        .map((r) => ({ recurrence: r, work: recurringWork.get(r.recordId) ?? null })),
      note:
        `Today is ${day}, in week ${week}. ` +
        (today.length === 0
          ? 'Nothing is planned for it yet.'
          : `${today.length} thing${today.length === 1 ? '' : 's'} planned.`) +
        ' Anything listed under `recurring` comes round today and is NOT on the plan — it is offered, not ' +
        'written, and putting it on today creates an ordinary allocation. Finishing that allocation ' +
        'finishes today, never the recurring work itself.',
    }
  })

  /**
   * 5D — APPLY AN APPROVED CHANGE SET.
   *
   * The last step of the flow the requirement describes, and the only one that writes to the
   * project: a plan, an agent's review of it from GET /api/plans/:id/context, a proposal carrying a change
   * set, a HUMAN settles it, then this.
   *
   * THREE GATES, IN ORDER, AND ALL THREE BEFORE ANYTHING IS WRITTEN.
   *
   *   1. An explicitly stated human. Owner decision §36: a governance act must say who it is, and a
   *      request with no actor headers is not evidence of a person. The same rule `assertMayWrite`
   *      applies to a decision, applied here by hand because this is not a record write.
   *   2. The fork has been settled BY WHOEVER MAY SETTLE IT — `forkIsSettled`, the same function
   *      the Needs your decision queue uses, so the queue and the door cannot disagree about what
   *      approval means. On a fork that is the owner's, or that nobody has classified, a decision
   *      an agent linked is not an approval. On a fork the corpus says an agent, the parent or a
   *      measurement settles, it is, because a human link is not what settles that fork.
   *   3. The change set itself is applicable: nothing unresolved, nothing stale. `applyDelta` owns
   *      those and runs the whole thing in one transaction.
   */
  /**
   * 6A / 6B — THE FACTS A REVIEW IS MADE OF, for a week or a month that has been.
   *
   * The owner did this by hand in Obsidian: look at what was planned, what got done, what did not,
   * what came out of nowhere, and decide what next. Mole Office cannot do the deciding and should not
   * try — **the primary product of a review is not an essay**, it is a structured set of facts, a
   * list of what changed, and a decision about what comes next.
   *
   * So this route computes the facts and stops. Every one of them is arithmetic over stored rows,
   * and every total says how many rows it could not count, because a review built on a floor
   * pretending to be a whole is worse than no review.
   *
   * WHAT IS DELIBERATELY NOT HERE: any judgement about whether the period went well, any
   * recommendation, and any narrative. An agent may critique this — that is 5B's context route and
   * this reply is shaped to be handed to it — and a person decides.
   */
  /**
   * 5E — WHAT A DEADLINE LOOKS LIKE, as deterministic arithmetic.
   *
   * The arithmetic is `shared/deadlines.ts` and is not restated here; this route's whole job is to
   * gather the inputs it needs from the stored corpus and hand them over. Which work is RELEVANT to
   * a deadline is the caller's answer, deliberately — an obligation cannot say what it depends on
   * (`blocked_by` is declared as free text), and a rule that read prose to decide would be a rule
   * prose can fool. So `?work=<id>,<id>` names it, and with none named the reply says so rather
   * than guessing.
   *
   * Nothing here turns "mid September" into a date. An obligation due on a condition has no window,
   * and every windowed number comes back null with `no-date` beside it.
   */
  app.get('/planning/deadline/:id', route('plan.week', 'remote', DEADLINE_NOTE),
    async (req): Promise<DeadlineReply> => {
    const { id } = parse(z.strictObject({ id: z.string().min(1) }), req.params, 'That is not a record id:')
    const query = parse(
      z.strictObject({ work: z.string().optional(), horizon: z.enum(GRAINS).optional() }),
      req.query,
      'The query string is not usable:',
    )
    const { getRecord } = await import('../lib/records.ts')
    const { readDue } = await import('@shared/work.ts')
    // The SAME stamp reader `computeAttention` is given, imported from the same place lib/records.ts
    // imports it from: a bare "2026-08-03" is due at the END of the 3rd, and a second opinion about
    // that would make a deadline late a day early on one surface and not the other.
    const { parseDueStamp } = await import('../../web/lib/attention.ts')
    const { deadlineOutlook, windowOf, periodsIn, deadlineTiming } = await import('@shared/deadlines.ts')
    const { allocationsCovering, capacityOf } = await import('../lib/planning.ts')

    // A MESSAGE THE CALLER MAY NOT READ IS ANSWERED AS AN ID NAMING NOTHING, before
    // its title can be read back: as the record asked about, with the same refusal, and as work named
    // beside it, counted among the ids nothing answers to below.
    const { refuseAMessageThisReaderMayNotRead, theMessageReader, theMessagesHiddenFrom } = await import('../lib/messages.ts')
    const reader = theMessageReader(actorFrom(req))
    const noRecordHasTheId = (): PanelError => new PanelError(`No record has the id "${id}".`, 404)
    refuseAMessageThisReaderMayNotRead(reader, id, noRecordHasTheId)
    const record = getRecord(id)
    if (record === undefined || record === null) throw noRecordHasTheId()

    const due = readDue(record.data)
    const now = Date.now()
    const dueMs = parseDueStamp
    const horizon = query.horizon ?? 'week'

    // The work this deadline is about: named by the caller, or nothing. See the header.
    const named = (query.work ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '')
    // AN ID NOTHING ANSWERS TO IS COUNTED, NOT DROPPED. This route used to filter it out in silence,
    // so a total covering three of four named records was drawn as though it covered four — the
    // confident number about nothing that the whole report exists to prevent. Found by the agent
    // building the browser surface, which had to compare what it asked for against what came back
    // to notice. It is answered here instead, once, where the ids were read.
    const hiddenWork = theMessagesHiddenFrom(reader, named)
    const found = named.map((workId) => ({ id: workId, record: hiddenWork.has(workId) ? null : (getRecord(workId) ?? null) }))
    const missing = found.filter((f) => f.record === null).map((f) => f.id)
    const work = found
      .map((f) => f.record)
      .filter((r): r is NonNullable<typeof r> => r !== undefined && r !== null)
      .map((r) => ({
        id: r.id,
        effortHours: typeof (r.data as { effort_hours?: unknown }).effort_hours === 'number'
          ? ((r.data as { effort_hours: number }).effort_hours)
          : null,
      }))

    const timing = deadlineTiming(due, now, dueMs)
    const window = windowOf(timing, now)
    const periods = window === null ? null : periodsIn(horizon, window)
    const allocations = window === null ? [] : allocationsCovering(window.from, window.to)
    const capacity =
      periods === null
        ? []
        : periods.whole
            .map((period) => capacityOf(horizon, period))
            .filter((c): c is NonNullable<typeof c> => c !== null)
            .map((c) => ({ horizon: c.horizon, period: c.period, hours: c.hours }))

    return {
      record: { id: record.id, kind: record.kind, title: record.title, workspaceId: record.workspaceId },
      named: { asked: named.length, sized: work.length, missing },
      outlook: deadlineOutlook({ now, due, dueMs, horizon, work, allocations, capacity }),
      note:
        'Deterministic arithmetic over what is stored, and nothing else. Which work is relevant to this ' +
        'deadline is the CALLER\'s answer — send ?work=<id>,<id> — because an obligation cannot say what it ' +
        'depends on and a rule that read prose to decide would be a rule prose can fool. Every unknown is ' +
        'reported as a named gap rather than as a zero: no date, nothing estimated, no capacity stated, ' +
        'ids you named that no record answers to (`named.missing`), ' +
        'periods that only partly overlap the window. Nothing here turns words like "mid September" into a ' +
        'date, so an obligation due on a condition has no window and every windowed number is null.',
    }
  })

  app.get('/planning/review/:horizon/:period', route('plan.week', 'remote', REVIEW_NOTE), async (req) => {
    const { horizon, period } = parse(grainParam, req.params, 'That is not a period this can read:')
    const parsed = parsePeriod(period)
    if (parsed === null || parsed.horizon !== horizon) {
      throw new PanelError(`"${period}" is not a ${horizon}.`)
    }
    const { allocationsIn, capacityOf, withWork } = await import('../lib/planning.ts')
    const mine = allocationsIn(horizon, period)
    const entries = withWork(mine)
    // The same reading the period reply gets. A review of a past week that could not say whether it
    // held one piece of work twice would report an hours figure nobody should act on.
    const load = loadOf(horizon, period, mine, hoursCountedTwiceIn(horizon, period))
    const capacity = capacityOf(horizon, period)

    // WHAT HAPPENED TO EACH SLICE. Three states, and `planned` at the end of a period that has gone
    // is its own answer — it is neither done nor deliberately dropped, it is work that was intended
    // and nobody said what became of it, which is the commonest and least visible outcome.
    const done = entries.filter((e) => e.allocation.state === 'done')
    const dropped = entries.filter((e) => e.allocation.state === 'dropped')
    const unfinished = entries.filter((e) => e.allocation.state === 'planned')

    // CARRIED: work that had time here and is still not finished. Read off the WORK's own state,
    // never off the allocation — completing a slice never completed the work (§34), so the two say
    // different things and this is the question the work answers. Whether a state is a finishing
    // one is asked of progressOf, the one table of state meanings, so a fulfilled obligation, a
    // worked-around problem and every other kind's finishing word leave the carried work together.
    // A state nobody has classified, or no state at all, is not known to be finished and stays.
    const carried = entries.filter(
      (e) => e.work !== null && !e.work.deleted && progressOf(e.work.state) !== 'finished',
    )

    const byProject = new Map<string, number>()
    for (const e of entries) {
      const key = e.work?.workspaceId ?? '(the record is gone)'
      byProject.set(key, (byProject.get(key) ?? 0) + 1)
    }

    return {
      horizon,
      period,
      from: parsed.from,
      to: parsed.to,
      load,
      capacity,
      counts: {
        allocations: entries.length,
        done: done.length,
        dropped: dropped.length,
        unfinished: unfinished.length,
        carried: carried.length,
        actualStated: load.actualStated,
      },
      /** Per project, because a week that spanned three of them is not one number. */
      byProject: Object.fromEntries(byProject),
      done,
      dropped,
      unfinished,
      carried,
      note:
        entries.length === 0
          ? `Nothing was planned in ${period}, so there is nothing to review. That is not the same as a ` +
            `period in which nothing happened — work done without being planned leaves no allocation.`
          : `${entries.length} allocation${entries.length === 1 ? '' : 's'} in ${period}: ${done.length} ` +
            `finished, ${dropped.length} dropped, ${unfinished.length} left as planned — which is not the ` +
            `same as dropped, it is a slice nobody said what became of. ${carried.length} name work that is ` +
            `still not done and carries into the next period. ` +
            (load.actualStated === 0
              ? 'Nobody recorded hours actually spent, so planned against actual cannot be answered at all.'
              : `${load.actualStated} of them recorded hours actually spent (${load.actualHours}h against ` +
                `${load.plannedHours}h planned), and the other ${entries.length - load.actualStated} did not.`),
    }
  })

  app.post('/planning/proposals/:id/apply', route(
      'plan.write',
      'local',
      // The person may apply from a paired computer with their own key: it writes records.
      { because: 'reserved-to-the-owner', act: 'Applying a planning proposal to the week', thePersonMayFromAnotherComputer: true },
      APPLY_NOTE,
    ), async (req) => {
    const { id } = parse(z.strictObject({ id: z.string().min(1) }), req.params, 'That is not a proposal id:')
    const actor = actorFrom(req)
    const theAct = theActKeptHere(req)
    // A SECRETARY THE PERSON HAS RAISED APPLIES IT AS THEY WOULD. A raised secretary holds the person's acts but a few, and
    // this is not one of them. Every record the change set writes then names the grant on its revision.
    // AND INSIDE A TEST WORLD, ITS STARTER AND THE SECRETARY, who hold the person's authority there (criterion P84, rule 5 of
    // chapter 8, problem aRP8Co6BB_Hv). Asked first and marking nothing, so the records it writes name the agent alone.
    const carriedForThem = actor.theOwnersAuthority?.holds === true || (actor.type === 'agent' && aRaiseCarriesIt(actor))
    if (!carriedForThem && (actor.type !== 'human' || actor.stated === false)) {
      throw new PanelError(
        actor.type !== 'human'
          ? `${theAct} writes to the project on the strength of a decision only a ` +
            `person may make, so only the person may apply it, or a secretary holding the person's grant where ` +
            `this office's list of what the grant carries says so. Any other agent is refused — this request ` +
            `came from ${actor.type} "${actor.id}". Nothing was written. Filing the proposal was your part.`
          : `This request sent no actor headers, so nothing said who is asking. ${theAct} is a ` +
            `governance act and an absent header is not evidence that a person made it. Nothing was ` +
            `written. Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>.`,
        403,
      )
    }
    // AND A STATED PERSON HAS TO HOLD THE PERSON'S KEY. Criterion P83, point 1: the header claim is
    // attribution, and the key is what makes a caller the person.
    if (!carriedForThem) assertThePersonIsProved(actor, theAct)

    const { getRecord, proposalResolution } = await import('../lib/records.ts')
    const { forkIsSettled } = await import('./needs-you.ts')
    const { applyDelta, writtenApplyNote } = await import('../lib/apply.ts')

    const proposal = getRecord(id)
    if (proposal === undefined || proposal === null) throw new PanelError(`No record has the id "${id}".`, 404)
    if (proposal.kind !== 'proposal') {
      throw new PanelError(`Record ${id} is a ${proposal.kind}, and only a proposal carries a change set.`)
    }
    const resolution = proposalResolution(proposal)
    const approved = resolution !== null && forkIsSettled(proposal.id, resolution)
    const applied = applyDelta(proposal.data, approved, actor)
    const remoteLine = sayItWasDoneFromAnotherComputer(req, `The planning proposal ${id} was applied to the week`)
    if (remoteLine !== null && applied.nothingWritten !== undefined) {
      const { nothingWritten, ...rest } = applied
      void nothingWritten
      return { ...rest, note: writtenApplyNote(applied.ops, applied.created, actor) }
    }
    return applied
  })

  /**
   * The windows touching a span of days. Overlap, not containment — see `windowsOverlapping`.
   *
   * NO WORKSPACE, like every other route in this region and for the same settled reason: a person's
   * week holds work from every project. The only records read are the ones a window already names.
   */
  app.get('/planning/windows', route('plan.read', 'remote', WINDOW_NOTE), async (req) => {
    const { from, to } = parse(windowRange, req.query, 'That is not a span of days this can read:')
    // ACROSS PROJECTS WHEN `?projects=` ASKS: only the windows whose work is in the projects asked for.
    // Without the word, every window, as this door has always answered.
    const across = theProjectsAQueryAsks(req.query, theMessageReader(actorFrom(req)))
    const found = windowsOverlapping(from, to)
    const windows =
      across === null ? windowsWithWork(found) : inTheProjectsAsked(windowsWithWork(found), across, askedEveryProject(req.query))
    // WHOSE WINDOW EACH ONE IS, KEPT OFF THE `WorkWindow` SHAPE. Criterion P5 needs the stamp so
    // the Schedule can draw an agent's window in a second colour; `toWindow` deliberately carries
    // no `created_by`, so it is read here by id and sent beside the windows. The words for a stamp
    // are composed by `ownerOfWindow` in src/shared/windowowner.ts, which every surface calls.
    const stamps = windowStamps(windows.map((one) => one.window.id))
    return {
      from,
      to,
      windows,
      owners: Object.fromEntries(windows.map((one) => [one.window.id, stamps.get(one.window.id) ?? null])),
      note:
        (windows.length === 0
          ? `Nothing is placed across ${from} to ${to}.`
          : `${windows.length} window${windows.length === 1 ? '' : 's'} touch${windows.length === 1 ? 'es' : ''} ` +
            `${from} to ${to}. A window may start before this span or end after it; it is here because it ` +
            `overlaps.`) +
        ' A WINDOW CARRIES NO HOURS. It says when somebody means to work on something, not how much ' +
        'time it takes, and nothing here is in any total.',
    }
  })

  /**
   * A DROPPED LINE OF THE PLAN: an allocation whose state is `dropped`, in a span of days.
   *
   * P5 draws planned against actual on the planning page, and a line somebody dropped is the half
   * of that pair the plan owns. An allocation is a line of the plan — one piece of work given a
   * number of hours in a period — and `dropped` is the one word that says the time did not happen,
   * which `shared/planning.ts` says of itself is what a review needs. This route returns the rows
   * and the stamp that says whose line it is; the sentence is composed by `againstActual` in
   * src/shared/horizons.ts, so the browser and the test draw the same words.
   *
   * NO WORKSPACE, like every route in this region. The only records read are the ones the plan
   * already names, so this is not a way to browse a project.
   */
  app.get('/planning/dropped-lines', route('plan.read', 'remote', DROPPED_LINES_NOTE), async (req) => {
    const { from, to } = parse(windowRange, req.query, 'That is not a span of days this can read:')
    // ACROSS PROJECTS WHEN `?projects=` ASKS: only the lines whose work is in the projects asked for,
    // each naming its work's project. Without the word, every line, as this door has always answered.
    const across = theProjectsAQueryAsks(req.query, theMessageReader(actorFrom(req)))
    const covering = allocationsCovering(from, to)
    const everyDropped = withWork(covering.filter((one) => one.state === 'dropped'))
    const dropped = across === null ? everyDropped : inTheProjectsAsked(everyDropped, across, askedEveryProject(req.query))
    const stamps = allocationStamps(dropped.map((one) => one.allocation.id))
    return {
      from,
      to,
      lines: dropped.map((one) => ({
        id: one.allocation.id,
        recordId: one.allocation.recordId,
        workTitle: one.work?.title ?? null,
        horizon: one.allocation.horizon,
        period: one.allocation.period,
        plannedHours: one.allocation.plannedHours,
        note: one.allocation.note,
        createdBy: stamps.get(one.allocation.id) ?? null,
        ...(across === null ? {} : { workspaceId: one.work?.workspaceId ?? null }),
      })),
      note:
        dropped.length === 0
          ? `No line was dropped in ${from} to ${to}. That is not the same as a span in which ` +
            'everything planned happened: a line nobody dropped and nobody finished is still planned.'
          : `${dropped.length} dropped line${dropped.length === 1 ? '' : 's'} in ${from} to ${to}. ` +
            'A dropped line is time somebody decided would not happen, which is different from a line left planned.',
    }
  })

  app.post('/planning/windows', route('plan.time', 'remote', WINDOW_NOTE), async (req, reply) => {
    const body = parse(newWindow, req.body, 'That is not a window Mole Office can store:')
    const made = createWindow(body, actorFrom(req))
    reply.code(201)
    return {
      window: made,
      note:
        `This work is placed from ${made.startsOn} to ${made.endsOn}, both days included — ` +
        `${windowDays(made)} day${windowDays(made) === 1 ? '' : 's'}. That says when you mean to work on ` +
        'it and nothing about how long it takes: NO HOURS WERE WRITTEN and no total changed. Give it ' +
        'hours with POST /api/planning/allocations if you want to say how much of a day or a week it gets.',
    }
  })

  app.patch('/planning/windows/:id', route('plan.time', 'remote', WINDOW_NOTE), async (req) => {
    const { id } = parse(z.strictObject({ id: z.string().min(1) }), req.params, 'That is not a window id:')
    const body = parse(windowPatch, req.body, 'That is not a change Mole Office can make:')
    const after = patchWindow(id, body, actorFrom(req))
    return {
      window: after,
      note:
        after.state === 'done'
          ? 'THIS WINDOW is finished. The work it names is untouched and still says whatever it said, so a ' +
            'task that outlasts one span stays honest. Complete the work itself through its own record.'
          : `Changed. It now runs ${after.startsOn} to ${after.endsOn}. Still no hours: a window says when, ` +
            'not how much.',
    }
  })

  app.delete('/planning/windows/:id', route('plan.time', 'remote', WINDOW_NOTE), async (req) => {
    const { id } = parse(z.strictObject({ id: z.string().min(1) }), req.params, 'That is not a window id:')
    const gone = deleteWindow(id)
    return {
      window: gone,
      note:
        'Taken off the schedule. The work it named is untouched, and so is any time given to it — hours ' +
        'live on allocations and were never part of this.',
    }
  })

  app.post('/planning/allocations', route('plan.time', 'remote', PLANNING_ROUTE_NOTE), async (req, reply) => {
    const body = parse(newAllocation, req.body, 'That is not an allocation Mole Office can store:')
    const made = createAllocation(body, actorFrom(req))
    reply.code(201)
    return {
      allocation: made,
      note:
        `"${made.period}" now gives this work ` +
        (made.plannedHours === null
          ? 'time without saying how long for, which is a real answer and counts as unstated in every total.'
          : `${made.plannedHours} hours.`) +
        ' The work itself is untouched: a plan points at work, it does not change it.',
    }
  })

  app.patch('/planning/allocations/:id', route('plan.time', 'remote', PLANNING_ROUTE_NOTE), async (req) => {
    const { id } = parse(z.strictObject({ id: z.string().min(1) }), req.params, 'That is not an allocation id:')
    const body = parse(allocationPatch, req.body, 'That is not a change Mole Office can make:')
    const after = patchAllocation(id, body, actorFrom(req))
    return {
      allocation: after,
      note:
        after.state === 'done'
          ? 'This SLICE OF TIME is complete. The work it names is untouched and still says whatever it said — ' +
            'completing an allocation never completes the work, so a task larger than a day stays honest. ' +
            'Complete the work itself through its own record when it is really finished.'
          : 'Changed. The work it names is untouched.',
    }
  })

  app.delete('/planning/allocations/:id', route('plan.time', 'remote', PLANNING_ROUTE_NOTE), async (req) => {
    const { id } = parse(z.strictObject({ id: z.string().min(1) }), req.params, 'That is not an allocation id:')
    const gone = deleteAllocation(id)
    return { allocation: gone, note: 'Taken off the plan. The work it named is untouched.' }
  })

  /**
   * Take back what a period holds. See `clearCapacity`: absent is a real answer and it was the one
   * a person could not get back to, because `hours: null` is refused and rightly so.
   */
  app.delete('/planning/capacity/:horizon/:period', route('plan.time', 'remote', PLANNING_ROUTE_NOTE), async (req) => {
    const { horizon, period } = parse(grainParam, req.params, 'That is not a period this can read:')
    const { clearCapacity } = await import('../lib/planning.ts')
    const { removed } = clearCapacity(horizon, period)
    return {
      removed,
      note: removed
        ? `${period} no longer says how many hours it holds. That is not zero hours: it is nobody having said, ` +
          `which is where it was before somebody answered.`
        : `${period} did not say how many hours it holds, so there was nothing to take back and nothing was written.`,
    }
  })

  app.put('/planning/capacity/:horizon/:period', route('plan.time', 'remote', PLANNING_ROUTE_NOTE), async (req) => {
    const { horizon, period } = parse(grainParam, req.params, 'That is not a period this can read:')
    const body = parse(capacityBody, req.body, 'That is not a capacity Mole Office can store:')
    const { setCapacity } = await import('../lib/planning.ts')
    // `note` UNMENTIONED IS NOT `note` CLEARED. See setCapacity: the browser's hours control sends
    // only a number, and absence meaning null erased the label on every adjustment.
    const saved = setCapacity(horizon, period, body.hours, body.note, actorFrom(req))
    return {
      capacity: saved,
      note: `${period} holds ${saved.hours} hours. Until this was set there was no answer, which is not the same as zero.`,
    }
  })
}
