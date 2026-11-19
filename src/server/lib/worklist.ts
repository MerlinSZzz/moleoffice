// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY PIECE OF WORK IN EVERY PROJECT, ONE ROW EACH, WITH WHAT IT IS PART OF AND ITS HOURS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The aim is to move between a high-level goal, work at the level of a pipeline or a module, a
 * detailed task, and a small operational item — and to flatten any slice of that into one dense
 * table. `design/ROUND-FOUR.md` states it in full. Until this file there was no answer to
 * "what do I have to do" that was not about one project: every work list took a project first, and a
 * browser that had never chosen one opened on `default`, which holds nothing.
 *
 * So this is one reading, across projects, and every row says which project owns it.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE IS A SECOND READER OF ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * Every fact in a row comes from the one place that already states it:
 *
 *   what counts as work    `KIND_FAMILIES.work` and `ALLOCATABLE_KINDS`, joined below and not
 *                          retyped. See `WORK_KINDS`.
 *   the records            `listRecords` with `ACROSS_WORKSPACES`, which is the declared way to ask
 *                          for every project at once.
 *   what it is part of     `ancestorsOf` in shared/containment.ts, the one reader of containment
 *                          across the three stores it is kept in.
 *   its estimate, its
 *   state, a block's name  `resolveAllocated` in lib/planning.ts, which is where "the estimate is
 *                          `data.effort_hours`" and "a block's title is qualified by its pipeline"
 *                          are stated.
 *   the hours it has       `allocationsOf` in lib/planning.ts.
 *   how it got here        the record's own `origin` column, read by `readOrigin` in shared/types.ts
 *                          where `listRecords` builds the record. Null stays null.
 *   how many of its
 *   fields are unfilled    `incompletenessOf` in lib/records.ts, the same reader the record's own
 *                          page and the search results use.
 *   when it is owed        `readDue` in shared/work.ts, the one reader of `data.due`, and
 *                          `KIND_SPECS` for whether the kind has that field at all.
 *
 * A row therefore cannot disagree with the record page, the plan or the schedule, because none of
 * those facts is worked out twice.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS ACROSS PROJECTS ON PURPOSE, AND THAT IS NOT A HOLE IN THE PROJECT BOUNDARY
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office authenticates nobody, and the project boundary is about meaning rather than access: a
 * reply must not answer about a project the caller did not ask about. This reading asks about all
 * of them deliberately and says so on every row, which is the same shape of answer planning and
 * `GET /api/needs-you` already give. It offers no filter, no search and no way to name one project,
 * so it cannot become a back door into one: it is all of them or nothing.
 *
 * IT WRITES NOTHING.
 */

import { checkSubtraction, type LeftOutCounts, type LeftOutGroup, type WorkListBucket, WORK_LIST_BUCKET_WORDS, leftOutWords } from '@shared/disclosure.ts'
import { ancestorsIn, containmentIndexOf, type ContainmentIndex, type ContainmentSource } from '@shared/containment.ts'
import { KIND_SPECS } from '@shared/kinds.ts'
import { GRAINS, type AllocationState, type Grain } from '@shared/planning.ts'
import type { PanelRecord, RecordKind, RecordOrigin } from '@shared/types.ts'
import { KINDS_A_PLAN_CAN_GIVE_HOURS_TO, KIND_FAMILIES, readDue, type Due, type WorkStateSource } from '@shared/work.ts'
import { ACROSS_WORKSPACES, allLinks, listRecords } from './records.ts'
import { incompletenessOf } from '@shared/incompleteness-of.ts'
import { allocationsOf, resolveAllocated } from './planning.ts'

// ============================================================================ what counts as work

/**
 * The kinds this list calls work: the kinds on the Work to do page, and the kinds a plan may give
 * time to.
 *
 * JOINED FROM THE TWO DECLARATIONS RATHER THAN TYPED OUT. Both live in shared/work.ts and neither
 * contains the other, because they answer different questions and that file argues the difference
 * at `PLAN_HOURS_BY_KIND`: `KIND_FAMILIES.work` says which PAGE a kind is read on, and
 * `KINDS_A_PLAN_CAN_GIVE_HOURS_TO` says which kinds can HOLD HOURS. So `purchase` is on the first
 * and not the second (money is not time), and `block` and `direction` are on the second and not the
 * first.
 *
 * A person asking "what have I got to do" wants both, so this is the join. Writing a third list
 * here is the defect this repository keeps producing: it could then disagree with either of the
 * other two and nothing would fail. A kind added to either declaration appears here on the next
 * request.
 */
export const WORK_KINDS: readonly string[] = [
  ...new Set<string>([...KIND_FAMILIES.work.kinds, ...KINDS_A_PLAN_CAN_GIVE_HOURS_TO]),
].sort()

/** Why those kinds and not others, in one sentence, for the reply and for GET /api. */
export const WORK_KINDS_BECAUSE =
  `Work here means the kinds a person reads under "${KIND_FAMILIES.work.label}" plus the kinds a plan may ` +
  `give hours to: ${WORK_KINDS.join(', ')}. A record that has been deleted is left out.`

/**
 * The three marks a row carries about the record itself, and what each one's absence means.
 *
 * WRITTEN ONCE AND READ TWICE: the reply's own `note` below, and `WORK_NOTE` in api/work.ts, which
 * is the sentence `GET /api` serves for this endpoint. Both say the same thing about the same
 * fields because there is one sentence. Every clause here is about an ABSENCE, because all three
 * fields have an empty-looking value that a page could draw as a fact somebody established.
 */
export const WORK_ROW_MARKS =
  'Every row also says how the record got here (`origin`), how many of its own fields nobody has ' +
  'filled in (`incompleteCount`), and when it is owed (`due`). ORIGIN IS NULL WHEN NOBODY HAS SAID, and ' +
  'null is not "authored" — a row nobody has stamped is a row nobody has judged, and reading it as a real ' +
  'project record is how fixture content comes to be quoted as an observation. `due` IS NULL WHEN THE KIND ' +
  'HAS NO DUE DATE FIELD, which is a fact about the kind and not about the record; a `due` whose `when` is ' +
  '`unstated` is the other answer — the field exists and nobody wrote in it. Lateness is not worked out ' +
  'here, because every row on one screen has to measure against one clock and that clock is the reader\'s.'

/**
 * The order the rows come back in, said in words, because a list with no stated order is a list
 * somebody will read as a ranking.
 *
 * ONE SENTENCE WITH TWO READERS — the reply's own `order` field and the note GET /api serves — so
 * the order the route declares and the order it uses cannot drift apart.
 */
export const WORK_ORDER =
  'Rows are ordered by project, then by what each piece of work is part of from the outermost thing ' +
  'inwards, then by title, then by id. So one project reads together, and things that sit under the ' +
  'same pipeline or module sit together. THIS IS NOT A RANKING: nothing in this list says what matters ' +
  'most or what to do first.'

/**
 * How many rows one reply carries at most.
 *
 * TWO THOUSAND, and the number is about the reply rather than about the database. The live corpus
 * holds 229 records of every kind, so this is far above anything this product has met; a JSON reply
 * larger than it is no longer something a person or a browser reads in one go.
 *
 * A CUT IS NEVER SILENT. `counted` says how many pieces of work there are, `returned` says how many
 * are in this reply, `leftOut` says how many are missing, and `note` says it in words. The rows that
 * are dropped are the tail of the stated order, so the cut is at a place a reader can point at.
 */
export const MAX_WORK_ROWS = 2000

// ============================================================================ what comes back

/** One thing a piece of work is part of. A projection of `Containment`, not a second reading. */
export interface WorkChainStep {
  id: string
  /** Its title, or the words saying no record with that id was read. */
  title: string
  /** Null when no record with that id was read. */
  kind: RecordKind | null
  /** Which project owns it. Null when no record with that id was read. May differ from the row's. */
  workspaceId: string | null
  /** Which store says this containment: a pipeline's stored order, or a stored "part of" link. */
  via: ContainmentSource
  /** 1-based place in a pipeline's stored order. Null when a link is what says it. */
  position: number | null
  /** True when it has been deleted and the containment is still stored. Null when it was not read. */
  deleted: boolean | null
}

/** Hours given to one piece of work in one period. Straight from the allocation row. */
export interface WorkHours {
  horizon: Grain
  /** The period key: `2026-09`, `2026-W36`, `2026-09-07`. */
  period: string
  /** Hours committed, or null when somebody planned the work here without saying how long. */
  plannedHours: number | null
  /** Hours spent, or null until somebody says. Never inferred from `plannedHours`. */
  actualHours: number | null
  state: AllocationState
}

/** One piece of work, at whatever level it sits. */
export interface WorkRow {
  id: string
  kind: RecordKind
  /** The record's real title. Canonical, and what its own page shows. */
  title: string
  /**
   * What to call it in a list, which for a block is not its title — see `AllocatedWork.name` in
   * lib/planning.ts for why. The same word every plan row already uses.
   */
  name: string
  /** For a block, the pipeline its name belongs to. Null for everything else. */
  within: string | null
  /** The one line the record carries, or null when nobody wrote one. */
  summary: string | null
  /** Its own state word, whatever its kind uses. Null when it has none. */
  state: string | null
  /** Carried from resolveAllocated, so a work chip can distinguish stored and derived words. */
  stateSource?: WorkStateSource | null
  /**
   * HOW THIS RECORD GOT HERE: `authored`, `fixture`, or NULL BECAUSE NOBODY HAS SAID.
   *
   * Null is not `authored`, and reading it as `authored` is the one way this field can do harm: 290
   * of one project's 385 records came in through the generated fixture, and a list that quietly
   * called every unstamped row a real project record would make fixture content read as observed
   * work. `ORIGIN_MEANINGS` and `unstampedOriginNote` in shared/types.ts are the words for all three
   * answers, and the value here is the record's own, read by `readOrigin` where the record is loaded.
   */
  origin: RecordOrigin | null
  /**
   * How many fields its kind says it should have and nobody has filled in. Zero is a real answer.
   *
   * `incompletenessOf` is the one reader — the same one `GET /api/records` and search already use —
   * so a count here cannot disagree with the mark on the record's own page.
   */
  incompleteCount: number
  /**
   * WHEN IT IS OWED, or null because this kind has no due date field at all.
   *
   * THE TWO ANSWERS ARE DIFFERENT AND ARE KEPT APART. `null` is a fact about the KIND: a task has no
   * `due` field, so there is nothing to have written and nothing is missing. A `Due` whose `when` is
   * `unstated` is a fact about the RECORD: the field exists and nobody filled it in. A page drawing
   * "no due date" over the first is claiming somebody looked.
   *
   * `readDue` in shared/work.ts is the one reader of `data.due`, and it carries all four ways a due
   * can be written — a date, a condition in words, another record, or nothing readable. Lateness is
   * NOT worked out here: `dueStandingOf` and `latenessMs` need a "now", and every row on one screen
   * has to measure against ONE clock, which is the reader's own. A server "now" folded into each row
   * would be stale by the time the page drew it.
   *
   * A PURCHASE IS NOT COVERED AND SAYS SO WITH `null`. A purchase records when its absence starts
   * costing something in a different field, and the one place that reads it lives in the browser. So
   * this list cannot see it, and a null here is honest about that rather than reporting "no date".
   * See the note returned with this task: it wants one shared reader of "when is this owed".
   */
  due: Due | null
  /** Which project owns it. */
  workspaceId: string
  /**
   * Everything this is part of, OUTERMOST FIRST, so the array reads as a path and its length is how
   * deep the work sits. Empty means nothing holds it.
   */
  above: WorkChainStep[]
  /**
   * Why the chain above is not the whole chain, in words, or null when it is whole.
   *
   * ONE FIELD RATHER THAN A FLAG AND A SENTENCE, so the two cannot disagree. It is set when the
   * stored data holds a loop, when a record has two parents, or when the chain is deeper than the
   * containment reader walks — see MAX_CONTAINMENT_DEPTH in shared/containment.ts.
   */
  aboveStopped: string | null
  /**
   * Every project in the chain above that is not this row's own, named.
   *
   * NOT HIDDEN, BECAUSE IT IS REAL. `createLink` refuses a link whose two ends are in different
   * projects, and rows written before that refusal existed are still stored — lib/move.ts names five
   * of them. A parent in another project is therefore something a reader can meet, and a row that
   * quietly dropped it would say the work sits under nothing.
   */
  parentsInOtherProjects: string[]
  /**
   * How big the whole piece of work is, in hours, or NULL WHEN NOBODY HAS SIZED IT.
   *
   * Never zero for unknown. Zero would mean somebody looked and said it takes no time.
   */
  estimateHours: number | null
  /**
   * The hours already given to it, every period it has any, past and future.
   *
   * Not a total. Hours at different horizons are never added — a month, a week inside it and a day
   * inside that are three answers to three questions, and `shared/planning.ts` says why. Ordered
   * month, week, day, then by period key.
   */
  hoursGiven: WorkHours[]
}

/** What `readWorkList` answers, and what GET /api/work sends. */
export interface WorkListReply {
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<WorkListBucket>[]

  rows: WorkRow[]
  /** How many pieces of work there are in every project. Counted before any cut. */
  counted: number
  /** How many rows are in this reply. */
  returned: number
  /** The most rows this reply would have carried. */
  cap: number
  /** How many pieces of work are missing from this reply. Zero means it is all of them. */
  leftOut: number
  /** The order the rows are in, and that it is not a ranking. */
  order: string
  /** Which kinds this list calls work, and why. */
  kinds: readonly string[]
  kindsBecause: string
  /** What this answer is, in words, including when it is empty and when it was cut. */
  note: string
}

// ============================================================================ the order

/**
 * Compare two sort keys element by element, with a shorter key first when one is the start of the
 * other. Written out because comparing joined strings would need a separator, and a separator is a
 * character a title is allowed to contain.
 */
function compareKeys(a: readonly string[], b: readonly string[]): number {
  const shared = Math.min(a.length, b.length)
  for (let at = 0; at < shared; at += 1) {
    const left = a[at]!
    const right = b[at]!
    if (left !== right) return left < right ? -1 : 1
  }
  return a.length - b.length
}

/**
 * The key that puts the rows in `WORK_ORDER`.
 *
 * The id goes in beside every title because titles may repeat — across projects always, and inside
 * one project for a block, whose title is qualified by its pipeline. Two rows that would otherwise
 * tie are then separated by something that cannot repeat, so the order is the same on every request.
 */
function orderKey(row: { workspaceId: string; title: string; id: string; above: WorkChainStep[] }): string[] {
  const key = [row.workspaceId]
  for (const step of row.above) key.push(step.title, step.id)
  key.push(row.title, row.id)
  return key
}

/**
 * Does this kind declare a due date field at all?
 *
 * Read off `KIND_SPECS`, which is the one declaration of what fields a kind has and the same one
 * `GET /api/kinds` serves. `kindDeclaresState` in shared/attention.ts asks this question about
 * `state` the same way and for the same reason: "this kind has no such field" and "nobody filled
 * this field in" are different answers and a screen draws them differently.
 *
 * A kind Mole Office does not know answers `false`: nothing can say what fields it has, so nothing can
 * read a due date off it either.
 */
function kindHasDueField(kind: RecordKind): boolean {
  const spec = KIND_SPECS[kind] as (typeof KIND_SPECS)[RecordKind] | undefined
  return spec !== undefined && spec.fields.some((field) => field.key === 'due')
}

/** Month, then week, then day — the order GRAINS declares — then by period key. */
function compareHours(a: WorkHours, b: WorkHours): number {
  const byGrain = GRAINS.indexOf(a.horizon) - GRAINS.indexOf(b.horizon)
  if (byGrain !== 0) return byGrain
  return a.period < b.period ? -1 : a.period > b.period ? 1 : 0
}

// ============================================================================ the reading

/** One read of the records table: every live record, and the work among them. */
interface Corpus {
  /** Every live record in every project. The containment reader needs all of them, not only work: a
   * block's parent is a pipeline, and a pipeline is not work. */
  records: PanelRecord[]
  /** The ones this list has a row for. */
  work: PanelRecord[]
}

/**
 * What one piece of work is part of, as a path from the outermost thing inwards.
 *
 * `ancestorsIn` answers nearest first, because that is the order a walk finds them in. A reader
 * drawing a level, or flattening one, wants the path: "the campaign, then wave 5, then this". So it
 * is reversed here, once, and the field says which way it reads.
 */
function chainOf(
  record: PanelRecord,
  index: ContainmentIndex,
): { above: WorkChainStep[]; aboveStopped: string | null } {
  const walk = ancestorsIn(record, index)
  const above = walk.steps
    .map(
      (step): WorkChainStep => ({
        id: step.id,
        title: step.title,
        kind: step.record === null ? null : step.record.kind,
        workspaceId: step.record === null ? null : step.record.workspaceId,
        via: step.via,
        position: step.position,
        deleted: step.deleted,
      }),
    )
    .reverse()
  return { above, aboveStopped: walk.complete ? null : walk.stopped }
}

/** Every live record in every project, and the work among them. */
function readCorpus(): Corpus {
  const all = listRecords({ workspaceId: ACROSS_WORKSPACES, includeDeleted: false })
  return { records: all, work: all.filter((record) => WORK_KINDS.includes(record.kind)) }
}

/** What this answer is, in words. Said here so the empty case and the cut case are both spoken. */
function noteFor(counted: number, returned: number, leftOut: number, cap: number): string {
  if (counted === 0) {
    return (
      'No work is filed in any project. That is an answer rather than an empty list: nothing has been ' +
      `recorded as work anywhere. ${WORK_KINDS_BECAUSE}`
    )
  }
  const head =
    `${String(counted)} piece${counted === 1 ? '' : 's'} of work across every project. ${WORK_KINDS_BECAUSE} ` +
    `Every row says which project owns it, everything it is part of, how big it is where anybody has said, ` +
    `and the hours it has already been given. ${WORK_ROW_MARKS}`
  if (leftOut === 0) return `${head} ${WORK_ORDER}`
  return (
    `${head} THIS LIST IS CUT: it carries the first ${String(returned)} of them. ` +
    `${leftOutWords(WORK_LIST_BUCKET_WORDS.row_limit, leftOut)} One reply carries at most ${String(cap)} rows. ` +
    `The ones missing are the end of the order below, and there is no way to ask for them here — read one ` +
    `project's records instead, with GET /api/records and a workspace header. ${WORK_ORDER}`
  )
}

/**
 * Every piece of work in every project, in the stated order, cut at `cap` and saying so.
 *
 * `cap` is a parameter rather than a constant read inside, so a test can prove the cut without
 * filing two thousand records. The route passes `MAX_WORK_ROWS` and the reply carries the number it
 * used, so what the product does is visible in what the product answers.
 *
 * THE COST, STATED. What each piece of work is part of is worked out for ALL of them, because that
 * is what the order is built from, and only then is the list cut. So `cap` limits the size of the
 * reply and the two queries that follow it — the estimates and the hours — and not the walk. The
 * walk is `ancestorsIn` once per piece of work, over one containment index built once per request
 * from records already in memory.
 */
export function readWorkList(cap: number): WorkListReply {
  if (!Number.isInteger(cap) || cap < 1) {
    throw new Error(`readWorkList was asked for ${JSON.stringify(cap)} rows. It must be a whole number, one or more.`)
  }

  const corpus = readCorpus()
  const links = allLinks(ACROSS_WORKSPACES)
  // Built once for this request and walked for every piece of work. Building it per piece of work
  // read every record and link again each time, which was most of the door's time.
  const index = containmentIndexOf({ records: corpus.records, links })

  const withChains = corpus.work.map((record) => ({ record, ...chainOf(record, index) }))
  withChains.sort((a, b) =>
    compareKeys(
      orderKey({ workspaceId: a.record.workspaceId, title: a.record.title, id: a.record.id, above: a.above }),
      orderKey({ workspaceId: b.record.workspaceId, title: b.record.title, id: b.record.id, above: b.above }),
    ),
  )

  const counted = withChains.length
  const kept = withChains.slice(0, cap)

  // The estimate, the state and a block's own name, from the one reader that states what those are.
  const sized = resolveAllocated(kept.map((entry) => ({ recordId: entry.record.id })))

  const rows = kept.map((entry): WorkRow => {
    const work = sized.get(entry.record.id)
    if (work === undefined) {
      // A record read a moment ago by the same process, by primary key, and not found. Nothing can
      // honestly be said about its estimate or its state, so this refuses rather than filling in.
      throw new Error(
        `"${entry.record.title}" (${entry.record.id}) was read from the records table and then could not be ` +
          `read back by its id. Nothing can be said about its estimate or its state, so this list is not ` +
          `answered at all rather than answered with a hole in it.`,
      )
    }
    const parentsInOtherProjects = [
      ...new Set(
        entry.above
          .map((step) => step.workspaceId)
          .filter((id): id is string => id !== null && id !== entry.record.workspaceId),
      ),
    ].sort()
    const hoursGiven = allocationsOf(entry.record.id)
      .map(
        (allocation): WorkHours => ({
          horizon: allocation.horizon,
          period: allocation.period,
          plannedHours: allocation.plannedHours,
          actualHours: allocation.actualHours,
          state: allocation.state,
        }),
      )
      .sort(compareHours)
    return {
      id: entry.record.id,
      kind: entry.record.kind,
      title: entry.record.title,
      name: work.name,
      within: work.within,
      summary: entry.record.summary,
      state: work.state,
      stateSource: work.stateSource,
      // All three read the record this row is about, which is already in memory. `origin` came off
      // the row through `readOrigin` when `listRecords` built it, so an unstamped record arrives
      // here as null and stays null.
      origin: entry.record.origin ?? null,
      incompleteCount: incompletenessOf(entry.record).length,
      due: kindHasDueField(entry.record.kind) ? readDue(entry.record.data) : null,
      workspaceId: entry.record.workspaceId,
      above: entry.above,
      aboveStopped: entry.aboveStopped,
      parentsInOtherProjects,
      estimateHours: work.effortHours,
      hoursGiven,
    }
  })

  const leftOutGroups: LeftOutGroup<WorkListBucket>[] = [{
    cause: 'budget', bucket: 'row_limit', count: counted - rows.length,
    ids: withChains.slice(cap).map((entry) => entry.record.id),
  }]
  const subtraction: LeftOutCounts = { candidates: counted, carried: rows.length, leftOut: counted - rows.length, shortened: 0 }
  checkSubtraction('readWorkList', subtraction, leftOutGroups)
  const leftOut = subtraction.leftOut
  return {
    rows,
    counted,
    returned: rows.length,
    subtraction,
    leftOutGroups,
    cap,
    leftOut,
    order: WORK_ORDER,
    kinds: WORK_KINDS,
    kindsBecause: WORK_KINDS_BECAUSE,
    note: noteFor(counted, rows.length, leftOut, cap),
  }
}

// ------------------------------------------------------- the home page's own reading of the answer

/**
 * THE FIELDS THE HOME PAGE'S ORDINARY READING DRAWS, AND NOTHING ELSE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The home page's first band draws one standing count, and the whole list is 702,267 bytes on a copy
 * of the owner's database (12 September 2026): `summary` alone is 230,759, `title` and `name` are 95,166
 * each, and `above` is 23,441. The band reads none of it. It hands the reply to `workStanding` in
 * HomePage.tsx, which walks the rows to count work that is not finished and work that has hours.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS KEPT, NAMED BY THE COMPONENT THAT DRAWS IT
 * ---------------------------------------------------------------------------------------
 *
 *   rows           the standing count's own subject. `workStanding` reads, per row, `state` through
 *                  `progressOf`, `workspaceId` for how many projects the unfinished work sits in,
 *                  and `hoursGiven` for whether the row was ever given hours. Only its LENGTH is
 *                  read, so the whole field is kept rather than replaced by a number that would be
 *                  the server's own answer to a question the page asks of the array.
 *   leftOut        what the cap cut, drawn under the count so a cut list is never read as the whole.
 *
 * EVERYTHING ELSE IS DROPPED, and it is dropped on purpose: `counted`, `returned`, `cap`, `order`,
 * `kinds`, `kindsBecause` and `note` are the list's own prose and arithmetic, which no band on the
 * home page reads; and per row `id`, `kind`, `title`, `name`, `within`, `summary`, `origin`,
 * `incompleteCount`, `due`, `above`, `aboveStopped`, `parentsInOtherProjects` and `estimateHours`
 * are drawn by `#/work` and `#/plan`, not by Home. The whole list is one query parameter away, and
 * `GET /api/work` without `shape` is unchanged.
 *
 * THE TYPE STAYS `WorkListReply`, exactly as `homeAttention` in api/queries.ts stays
 * `AttentionReading`: the shape is a declared selection named in the request, and the caller that
 * asks for it is the home page.
 */
export function homeWorkRow(row: WorkRow): WorkRow {
  return {
    state: row.state,
    workspaceId: row.workspaceId,
    hoursGiven: row.hoursGiven,
  } as WorkRow
}

export function homeWorkList(reply: WorkListReply): WorkListReply {
  return {
    rows: reply.rows.map(homeWorkRow),
    leftOut: reply.leftOut,
    subtraction: reply.subtraction,
    leftOutGroups: reply.leftOutGroups,
  } as WorkListReply
}

// ------------------------------------------------------- the Work to do page's own reading of the answer

/**
 * THE ROW THE WORK TO DO PAGE DRAWS: EVERY FIELD BUT `title`, `summary` AND `within`.
 *
 * `#/work` names a row by `name`, and never draws its title, its one line or the pipeline a block's
 * name belongs to. On the made-up office of the live size (11 October 2026) those three are 119,259
 * of the 775,416 bytes the whole list answers; its one-line summaries are short, and on a copy of the owner's
 * database `summary` alone was 230,759 of 702,267 (12 September 2026). The other readers of the whole list
 * still need them: the planning drawer on `#/plan` filters by title and one line and draws `within`,
 * and the plan table's picker on `#/plans/<id>` filters by title. So they ask without a shape.
 *
 * The type drops the three fields, so a later change to the page that reads one of them fails the type
 * check instead of drawing nothing.
 */
export type WorkPageRow = Omit<WorkRow, 'title' | 'summary' | 'within'>

/** What `GET /api/work?shape=page` answers: the whole list's counts and words, and the rows the page draws. */
export type WorkPageReply = Omit<WorkListReply, 'rows'> & { rows: WorkPageRow[] }

export function workPageList(reply: WorkListReply): WorkPageReply {
  return { ...reply, rows: reply.rows.map(({ title: _title, summary: _summary, within: _within, ...row }) => row) }
}
