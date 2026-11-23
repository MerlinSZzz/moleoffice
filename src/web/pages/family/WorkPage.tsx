// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { RAIL_WORD_KEYS } from '@shared/surfaces.ts'
/**
 * `#/work` — every piece of work in every project, at whatever level it sits.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PAGE IS
 * ---------------------------------------------------------------------------------------
 * Designed again in report n9Mjk3c_sJRu, block b-13, under two
 * decisions. It reads `GET /api/work` — every piece of
 * work in every project, each row carrying its whole parent chain — and draws two sections:
 *
 *   LATE         first, in the ask colour: the work past its date that is not finished, most late
 *                first. When there is none, the quiet line "Nothing is late". The rows do not
 *                say who a piece of work waits on (question 18 of that report), so the section is
 *                "past its date and not finished", which is `workBand`'s reading. It was called
 *                "Needs you" until wave 13q's round 28; that name is Home's waiting queue's alone
 *                (problem uyvrTRyshEJ6).
 *   ALL WORK     with a switch between two views:
 *                  BY LEVEL  a list grouped by project, where each parent folds its parts, with one
 *                            indent step and never more. Where the page is wide enough, the
 *                            project groups stand side by side.
 *                  ONE LIST  a table: every piece of work as one row, with what it is part of and
 *                            its project in columns of their own.
 *
 * Nothing stands between the title and Late: the count sentences and the "fold every level"
 * bar are gone (block b-13).
 *
 * ---------------------------------------------------------------------------------------
 * THE LEFT EDGE IS FIXED
 * ---------------------------------------------------------------------------------------
 * Every leading mark is in a cell of its own with a fixed width — the state in the first column,
 * the press that folds a level in an 18px box at the head of the title cell, drawn or not. So a
 * title starts at one of two x values in the list: the margin, or one step in.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A ROW SAYS ABOUT ITSELF
 * ---------------------------------------------------------------------------------------
 *   HOW THE RECORD GOT HERE. `origin` is `authored`, `fixture`, or NULL BECAUSE NOBODY HAS SAID,
 *   and those are three answers drawn as three. `RowMarks` draws the exceptions and
 *   `UnmarkedRowsNote` at the foot says what a row with no mark means.
 *
 *   HOW MUCH OF THE RECORD IS UNFILLED. `incompleteCount`, drawn only when it is not zero.
 *
 *   WHEN IT IS OWED. `due` is the record's own date, and only a date can make anything late. Work
 *   owed on a condition somebody wrote is WAITING, and nobody is behind on it. `readRowDue` below
 *   is the one reader.
 *
 * ---------------------------------------------------------------------------------------
 * ONE CLASSIFIER FOR STATE, AND IT IS NOT THIS FILE'S
 * ---------------------------------------------------------------------------------------
 * `progressOf` in src/shared/work.ts is the only thing that says what a state word means — the same
 * function Home counts "not finished" with. `workBand`, which decides whether a passed date still
 * needs a person, is given `progressOf`'s answer and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * ABSENCE
 * ---------------------------------------------------------------------------------------
 *   - A column Mole Office cannot fill for ANY row is left out rather than drawn empty.
 *   - "Nobody has sized this" is the short mark, never 0h. Zero would mean somebody looked.
 *   - A kind with no state field is the short mark, with its reason on hover.
 *   - A row whose chain Mole Office could not finish reading is NEVER drawn as top-level. It has its
 *     own group and says that the containing records could not be read.
 */

import { useEffect, useMemo, useState } from 'react'
import { kindDeclaresState } from '@shared/attention.ts'
// WHAT A ROW IS, said on the row itself. See the header of src/shared/targets.ts.
import { targetAttributes } from '@shared/targets.ts'
import {
  dueStandingOf,
  latenessMs,
  progressOf,
  KIND_FAMILIES,
  type DueStanding,
  DUE_STANDINGS,
} from '@shared/work.ts'
import type { WorkspacesReply } from '../../../server/api/workspaces.ts'
// THE REPLY'S SHAPE IS THE SERVER'S OWN DECLARATION, re-exported by api.ts and imported as a TYPE,
// so nothing here restates a field name the route decides. A type import is erased, so the browser
// bundle never reaches into src/server.
import { api, type WorkPageReply, type WorkPageRow } from '../../api.ts'
// One step of a row's parent chain. api.ts re-exports the reply and the row but not this, so it is
// imported from the declaration itself — the same type, and a type import is erased.
import type { WorkChainStep } from '../../../server/lib/worklist.ts'
import { FamilyHead, QuickFile, RowMarks } from '../../components/family/parts.tsx'
// A section says what it is, so a person can point at it, the way a panel does.
import { DRAWS_THE_NAME } from '../../components/agent/pointing.ts'
import { declaredAttributes } from '../../components/declares.ts'
// THE ONE FUNCTION IN THE BROWSER THAT NAMES A PROJECT. Renamed on the way in because this file
// exports a `projectName` of its own, which answers a second question — whether the reply that
// lists the projects held this id — and gets the name itself from here.
import { projectName as onScreen } from '../../lib/projects.ts'
// The one reader of "does a passed date still need a person". See `readRowDue`.
import { workBand } from '../../components/family/read.ts'
import { InReach } from '../../components/InReach.tsx'
import { recordPath } from '../../components/router.tsx'
import {
  Absence,
  Btn,
  ErrorNote,
  latePhrase,
  Loading,
  NoStateMark,
  Panel,
  StoredState,
  Tag,
  UnmarkedRowsNote,
} from '../../components/ui.tsx'
import { useProjectAsync } from '../../lib/project-async.ts'
// A bare "2026-08-03" is owed by the END of the 3rd. One reader, shared with the server.
import { parseDueStamp, readDueStamp } from '../../lib/attention.ts'
import { useInspect } from '../../lib/mode.ts'
import { useNearTheScreen } from '../../lib/nearthescreen.ts'
// The one width of the fixed first column, on every family page. See `columnsFor`.
import { FAMILY_SEV } from './rows.tsx'
import { SideBySide } from '../../components/SideBySide.tsx'

// ============================================================================ the two arrangements

export const WORK_VIEWS = ['levels', 'flat'] as const
export type WorkView = (typeof WORK_VIEWS)[number]

/**
 * THE NARROWEST A ROW'S TITLE MAY BE. Below this a title bends into a column of single letters,
 * which is not a title a person can read. The row gives its facts a line of their own before it
 * lets the title go under this, and the stylesheet and its browser test read the width here.
 */
export const WORK_TITLE_MIN = '10rem'

/**
 * What each view is called on the switch, and what it is for.
 *
 * NAMED AFTER WHAT THE READER GETS, not after the mechanism: "By level" is the grouped list, and
 * "One list" is the table (report n9Mjk3c_sJRu, block b-13).
 */
export const WORK_VIEW_WORDS: Readonly<Record<WorkView, { label: string }>> = {
  levels: {
    get label(): string { return t('g7a.work.levels') },
  },
  flat: {
    get label(): string { return t('workPage.oneList') },
  },
}

// ============================================================================ the tree

/**
 * One level of the tree: either a piece of work, or something work sits under that is not itself
 * work.
 *
 * BOTH EXIST BECAUSE 95 OF THE 96 PARENTS IN THE LIVE CORPUS ARE NOT WORK. A block's parent is a
 * pipeline and a task's parent is a module, and neither is on this list — `GET /api/work` returns
 * the kinds a person has to DO. A tree that dropped them would put 95 rows at the top level and
 * lose the level a person needs to move between; a tree that invented rows for them would put a
 * pipeline in a list of things to do. So they are drawn as a heading over their parts, which is
 * what they are.
 */
export interface WorkNode {
  /** The record id. Identity, and the collapse key. */
  key: string
  /** The piece of work, or null when this level is not itself work. */
  row: WorkPageRow | null
  /** How the chain named this level, when it is not itself work. Null when `row` is set. */
  step: WorkChainStep | null
  children: WorkNode[]
  /** How many pieces of work sit at or under this level, itself counted when it is one. */
  workCount: number
}

/** One project's work, as levels. */
export interface WorkProject {
  workspaceId: string
  /** The levels and the work at the top of this project, in the order the server sent them. */
  roots: WorkNode[]
  /**
   * Work whose chain Mole Office could not finish reading AND that has no readable parent at all.
   *
   * KEPT APART FROM WORK THAT REALLY SITS UNDER NOTHING. Those are two different facts and only
   * one of them is a piece of work at the top of a project.
   */
  unreadable: WorkPageRow[]
  /** Every piece of work in this project, whichever of the two lists above holds it. */
  count: number
}

/**
 * The tree, and every disagreement found while building it.
 *
 * A CONTRADICTION IS COLLECTED RATHER THAN SWALLOWED. Two rows can name different parents for one
 * record only if the three containment stores disagree, and this is the one place that would
 * notice. Placing the level on first sight and saying nothing would draw one of the two answers as
 * the truth.
 */
export interface WorkLevels {
  projects: WorkProject[]
  contradictions: string[]
}

/** Build the tree. Pure, so a test can drive it without a DOM. Order is the server's throughout. */
export function buildLevels(rows: readonly WorkPageRow[]): WorkLevels {
  interface Building {
    project: WorkProject
    nodes: Map<string, WorkNode>
    parentOf: Map<string, string | null>
  }
  const building = new Map<string, Building>()
  const contradictions: string[] = []

  const projectFor = (workspaceId: string): Building => {
    const already = building.get(workspaceId)
    if (already !== undefined) return already
    const made: Building = {
      project: { workspaceId, roots: [], unreadable: [], count: 0 },
      nodes: new Map(),
      parentOf: new Map(),
    }
    building.set(workspaceId, made)
    return made
  }

  for (const row of rows) {
    const here = projectFor(row.workspaceId)
    here.project.count += 1

    // A CHAIN THAT STOPPED AND NAMED NOTHING IS NOT A TOP-LEVEL PIECE OF WORK. It is a row whose
    // place Mole Office could not read, and the two are drawn apart.
    if (row.aboveStopped !== null && row.above.length === 0) {
      here.project.unreadable.push(row)
      continue
    }

    let parent: WorkNode | null = null
    for (const step of row.above) {
      const seat = place(here, step.id, parent, () => ({
        key: step.id,
        row: null,
        step,
        children: [],
        workCount: 0,
      }))
      parent = seat
    }
    place(here, row.id, parent, () => ({ key: row.id, row: null, step: null, children: [], workCount: 0 })).row = row
  }

  /**
   * Put a level in its place, once, and report it when a second row asks for a different place.
   *
   * `make` is called only when the level is new, so a level first met as somebody's ancestor keeps
   * the seat it was given and later gets its own row filled in.
   */
  function place(here: Building, key: string, parent: WorkNode | null, make: () => WorkNode): WorkNode {
    const already = here.nodes.get(key)
    if (already !== undefined) {
      const seated = here.parentOf.get(key) ?? null
      const asked = parent === null ? null : parent.key
      if (seated !== asked) {
        contradictions.push(
          t('g7a.work.conflictDetail', { work: nameOfNode(already), first: seated === null ? t('absence.mark') : nameOfKey(here, seated), second: asked === null ? t('absence.mark') : nameOfKey(here, asked) }),
        )
      }
      return already
    }
    const made = make()
    here.nodes.set(key, made)
    here.parentOf.set(key, parent === null ? null : parent.key)
    if (parent === null) here.project.roots.push(made)
    else parent.children.push(made)
    return made
  }

  const projects = [...building.values()].map((entry) => {
    for (const root of entry.project.roots) countWork(root)
    return entry.project
  })
  return { projects, contradictions }
}

// ============================================================================ how much is drawn at once

/**
 * HOW MANY LINES OF ALL WORK ARE DRAWN AT ONCE, AND HOW MANY MORE EACH TIME THE FOOT COMES NEAR. Wave 13x round 10.
 *
 * On an office of the live size `GET /api/work` answers 2,000 rows, and drawing all of them kept the page from
 * being ready for most of a second after the answer came. The first lines are drawn at once and the rest as the
 * person scrolls down. The line at the foot says how many are shown of how many, and its press shows them all,
 * so a search of the page in the browser can reach every row.
 */
export const WORK_LINES_DRAWN_FIRST = 100
export const WORK_LINES_DRAWN_EACH_STEP = 200

/** Where each line of one project's By level list falls, counted down the page from the top of All work. */
export interface ProjectLines {
  /** The place of the project's first line. */
  start: number
  /** The place of each level and piece of work, by its key. Parts under a folded level have none. */
  at: Map<string, number>
  /** The place of the line over the work whose parents could not be read; its rows follow it. */
  unreadableStart: number
}

/** Every line's place in the By level list, in the order it is drawn, and how many lines there are. */
export function linesOfLevels(levels: WorkLevels, folded: ReadonlySet<string>): { projects: ProjectLines[]; total: number } {
  let next = 0
  const projects = levels.projects.map((project) => {
    const at = new Map<string, number>()
    const start = next
    const walk = (node: WorkNode): void => {
      at.set(node.key, next)
      next += 1
      if (!folded.has(node.key)) for (const child of node.children) walk(child)
    }
    for (const root of project.roots) walk(root)
    const unreadableStart = next
    if (project.unreadable.length > 0) next += 1 + project.unreadable.length
    return { start, at, unreadableStart }
  })
  return { projects, total: next }
}

/**
 * THE LINE AT THE FOOT OF A LIST DRAWN IN PART. It draws the next lines when it comes within a screen of the window.
 * The caller keys it by how many are drawn, so each step watches afresh.
 */
function TheRestAsYouScroll({ drawn, total, onMore, onAll }: { drawn: number; total: number; onMore: () => void; onAll: () => void }) {
  const [place, near] = useNearTheScreen()
  useEffect(() => {
    if (near) onMore()
  }, [near, onMore])
  return (
    <p ref={place} className="wk-more" data-drawn={drawn} data-total={total}>
      <span>{t('w13w.part.shown', { n: drawn, total })}</span>
      <Btn size="sm" onClick={onAll}>
        {t('g7a.family.showAll', { n: total })}
      </Btn>
    </p>
  )
}

/** How many pieces of work sit at or under each level. Post-order, so a parent counts its parts. */
function countWork(node: WorkNode): number {
  let total = node.row === null ? 0 : 1
  for (const child of node.children) total += countWork(child)
  node.workCount = total
  return total
}

/** What to call a level in a sentence. Title and id, because ID IS IDENTITY and titles may repeat. */
function nameOfNode(node: WorkNode): string {
  const title = node.row?.name ?? node.step?.title ?? node.key
  return `"${title}" (${node.key})`
}

function nameOfKey(here: { nodes: Map<string, WorkNode> }, key: string): string {
  const node = here.nodes.get(key)
  return node === undefined ? key : nameOfNode(node)
}

// ============================================================================ when it is owed

/** What this page can say about one row's date. */
export interface RowDue {
  /**
   * How far from the date this is, in milliseconds: positive is past it, negative is short of it.
   *
   * IT IS THE SUBTRACTION, NOT THE JUDGEMENT. `late` below is the judgement, and the two differ on
   * a fulfilled obligation whose date passed: the distance is real and nobody is behind.
   *
   * NULL MEANS THERE IS NO NUMBER TO STATE, and it is never a zero and never "on time". It is null
   * for a kind with no date field, for a date field nobody filled in, for work owed on a condition,
   * and for a stored date Mole Office cannot read. Those are four different situations and `dueCensus`
   * below is what counts them apart; this field only says there is no number.
   */
  lateMs: number | null
  /** The words beside the state word — "6 days late", "due today". Null when there is nothing to say. */
  said: ReturnType<typeof latePhrase>
  /** True when a date Mole Office can read has passed AND the work still needs a person. */
  late: boolean
}

/** The chip's words for a stored due, read once by `readDueStamp`, which gives the due moment: the end of a date's day, or the moment itself. */
function latePhraseOfDue(due: WorkPageRow['due'], now: number): ReturnType<typeof latePhrase> {
  const read = due === null || due.when !== 'date' || due.date === undefined ? null : readDueStamp(due.date)
  return read === null ? null : latePhrase(read.ms, now, undefined, read.due)
}

/**
 * Read one row's date.
 *
 * ---------------------------------------------------------------------------------------
 * A KIND WITH NO DATE FIELD IS NOT A DATE NOBODY FILLED IN
 * ---------------------------------------------------------------------------------------
 * `row.due` is null when the record's KIND has no due date field at all — 210 of the 219 rows in
 * the live corpus, because a task, a problem, a block and a direction have no such field. A `Due`
 * whose `when` is `unstated` is the other thing: the field exists and nobody wrote in it. Handing
 * the first to `latenessMs` dressed as the second would report a fact about the kind as a gap in
 * the record, so it is not handed over at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHETHER A PASSED DATE STILL NEEDS A PERSON IS `workBand`'S ANSWER, NOT THIS FILE'S
 * ---------------------------------------------------------------------------------------
 * An obligation fulfilled two days after it was owed is not a thing to do today. That rule is
 * already written down — `workBand` in components/family/read.ts tests `finished` BEFORE lateness —
 * and one of the four rows past its date in the live corpus is exactly that case. So this asks
 * `workBand` rather than testing `finished` again here, and the two cannot come apart.
 *
 * `putDown` IS PASSED AS NULL AND THAT CHANGES NEITHER ANSWER. A work row carries no `data`, so
 * this page cannot read why something was put down. It cannot matter here: `workBand` tests
 * lateness before it tests a put-down reason, so a late row that has not finished is
 * `needs-a-person` whatever was written, and `settled` is decided by `finished` alone.
 */
export function readRowDue(row: Pick<WorkPageRow, 'due' | 'state'>, now: number): RowDue {
  const lateMs = row.due === null ? null : latenessMs(row.due, now, parseDueStamp)
  const band = workBand(progressOf(row.state), lateMs, null)
  return {
    lateMs,
    // NOTHING ABOUT A DATE IS SAID ON SETTLED WORK. "9 days late" on a fulfilled obligation is a
    // true subtraction and a false statement: nobody is behind on it.
    said: band === 'settled' ? null : latePhraseOfDue(row.due, now),
    late: band === 'needs-a-person' && lateMs !== null && lateMs > 0,
  }
}

/**
 * How many rows could be late at all, and how many are.
 *
 * "Nothing here is past its date" is a claim nobody can check unless the page also says how many
 * rows carry a date. On the live corpus that is 7 of 219, so the sentence without its denominator
 * would read as "everything is on time" about 210 rows that can never be either.
 */
export interface DueCensus {
  /** Rows whose KIND has no date field at all. A fact about the kind, not about the record. */
  noDueField: number
  /** Rows whose kind has the field, counted by what Mole Office can say about what was written in it. */
  byStanding: Record<DueStanding, number>
  /** Rows past a date Mole Office can read that still need a person. The band's own count. */
  late: number
}

export function dueCensus(rows: readonly WorkPageRow[], now: number): DueCensus {
  const byStanding = Object.fromEntries(DUE_STANDINGS.map((standing) => [standing, 0])) as Record<DueStanding, number>
  let noDueField = 0
  let late = 0
  for (const row of rows) {
    if (row.due === null) noDueField += 1
    // `dueStandingOf` is the shared reader of which of the five situations a written due is in.
    else byStanding[dueStandingOf(row.due, parseDueStamp)] += 1
    if (readRowDue(row, now).late) late += 1
  }
  return { noDueField, byStanding, late }
}

/*
 * `DUE_COUNT_WORDS` WAS HERE AND IS DELETED. It was a table over `DueStanding` giving one clause
 * per situation — "1 carries a date Mole Office can read", "1 has a date field nobody has filled in",
 * "234 are of a kind with no date field" — and `dueCensusSentences` printed every non-zero one
 * under the list of late work. Four sentences about a schema, under three things a person has to
 * do. The classification is still made and still counted, in `dueCensus` above; what stopped is
 * spelling it out on the page. The long per-record sentences are `DUE_STANDING_SENTENCES` in
 * shared/work.ts, which is a different sentence for a page showing ONE record and is untouched.
 */

/**
 * The census in words. One idea per sentence, and no sentence for a count of zero.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS SAID BEFORE, AND WHY IT STOPPED
 * ---------------------------------------------------------------------------------------
 *
 * Four sentences, under a list of three late things:
 *
 *   Only a date can make work late. 7 carry a date Mole Office can read. 2 have a date field nobody has
 *   filled in. 234 are of a kind with no date field, so nothing about them can be late.
 *
 * "A date field nobody has filled in" and "of a kind with no date field" are the field's name and
 * the kind declaration spoken aloud, and none of the 236 records in the last two sentences needs
 * anybody to do anything. Absence has almost no weight unless it needs action.
 *
 * WHAT IS WORTH SAYING IS THAT THE NUMBER 3 IS NOT THE WHOLE ANSWER, and one clause carries it: how
 * many of the ones that CAN be late are, and that the rest have no date. The split between "no date
 * written" and "no date field at all" is a fact about the schema; it is still on the reply.
 */
export function dueCensusSentences(census: DueCensus): string[] {
  const said: string[] = []
  const dated = DUE_STANDINGS.reduce((n, standing) => n + census.byStanding[standing], 0)
  if (dated === 0) {
    said.push(t('g7a.work.noDates'))
    return said
  }
  said.push(
    census.late === 0
      ? t('g7a.work.noneLate', { n: dated })
      : t('g7a.work.late', { late: census.late, n: dated }),
  )
  return said
}

// ============================================================================ the page

/**
 * The page: one read of `GET /api/work`, one read of the project names, and the list.
 *
 * IT TAKES NO RECORDS. A work list that shows one project is a filter nobody asked for, so this page reads every
 * project through `GET /api/work`. `FamilyPage` used to read the whole project for it anyway and hand it over unused:
 * on the live office that was 142 MB a load (round 15).
 */
export function WorkPage({
  onFiled,
  /**
   * ONE CLOCK FOR EVERY ROW ON THE SCREEN. Lateness is measured against it, and two rows reading
   * two different "now"s is how a list comes to say "due today" and "1 day late" about one date.
   * It defaults here because the caller that renders this page passes no clock.
   */
  now = Date.now(),
}: {
  onFiled: () => void
  now?: number
}) {
  const [state, reload] = useProjectAsync(
    () =>
      Promise.all([
        api.workPage(),
        // THE PROJECT NAMES. A row says which project owns it, and "unassigned" is an id — the
        // reader's word for it is "Unassigned", which only this reply knows. Both requests fail
        // together on purpose: a work list drawn with ids where the names should be would be this
        // page quietly answering a different question.
        api.listWorkspaces(),
      ]),
    [],
  )

  const filedSomething = () => {
    onFiled()
    reload()
  }

  return (
    <>
      <FamilyHead
        // THE TITLE READS THE KEY ITS SIDEBAR ROW READS, so the row that opens this page and this
        // heading are one word in every language (problem IfJ_JmeZ-3vr).
        title={t(RAIL_WORD_KEYS['rail.work'])}
        actions={
          <>
            <QuickFile
              kind="problem"
              label={t('g7a.work.fileProblem')}
              fieldLabel={t('g7a.work.problemField')}
              variant="primary"
              onFiled={filedSomething}
            />
            <QuickFile kind="task" label={t('g7a.work.addTask')} fieldLabel={t('g7a.work.taskField')} onFiled={filedSomething} />
          </>
        }
      />

      {state.status === 'loading' ? <Loading label={t('g7a.work.loading')} rows={8} /> : null}
      {state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} retry={reload} />
      ) : null}
      {state.status === 'ready' ? <WorkList reply={state.value[0]} projects={state.value[1]} now={now} /> : null}
    </>
  )
}

/**
 * The list itself, given the two replies. Exported so a test can drive both views without a server
 * and without a DOM.
 *
 * THE PAGE IS TWO SECTIONS (report n9Mjk3c_sJRu, block b-13):
 *   LATE        the work past its date that is not finished, most late first. When there is none,
 *               the quiet line "Nothing is late".
 *   ALL WORK    every piece of work, with a switch between two views: By level, a list grouped by
 *               project where each parent folds its parts; and One list, a table.
 *
 * `view` SEEDS THE STATE AND DOES NOT CONTROL IT. A test names the view it wants to read; a person
 * presses the switch and the page keeps their choice.
 */
export function WorkList({
  reply,
  projects,
  view: opening = 'levels',
  folded: shutAtFirst,
  /** The clock every row is measured against. See the note on `WorkPage`. */
  now = Date.now(),
}: {
  reply: WorkPageReply
  projects: WorkspacesReply
  view?: WorkView
  /** Which levels start folded. Seeds the state the same way `view` does, and for the same reason. */
  folded?: readonly string[]
  now?: number
}) {
  const inspect = useInspect()
  const [view, setView] = useState<WorkView>(opening)
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set(shutAtFirst ?? []))

  const levels = useMemo(() => buildLevels(reply.rows), [reply.rows])
  const names = useMemo(
    () => new Map(projects.workspaces.map((workspace) => [workspace.id, workspace.title])),
    [projects.workspaces],
  )

  // WHICH COLUMNS HAVE ANYTHING TO HOLD. A column no row can fill is left out rather than drawn
  // empty; see `columnsFor`.
  const anySized = reply.rows.some((row) => row.estimateHours !== null)
  const anyHours = reply.rows.some((row) => row.hoursGiven.length > 0)
  // WHAT THE ROWS SAY ABOUT THEMSELVES. A row is marked when it is anything other than plainly
  // authored — a made-up example, a row nobody has stamped, a stored word Mole Office cannot read —
  // or when the record has a field nobody has filled in. NULL IS NOT AUTHORED, which is why the
  // test is against `authored` rather than for `fixture`.
  const anyMarks = reply.rows.some((row) => row.origin !== 'authored' || row.incompleteCount > 0)

  // WHEN THINGS ARE OWED, counted once for the page, from the one reader. Drawn in developer mode.
  const census = useMemo(() => dueCensus(reply.rows, now), [reply.rows, now])
  // NEEDS YOU: past its date and not finished, most late first. THE ONLY ORDERED LIST ON THIS PAGE:
  // everywhere else the order is the server's and says it is not a ranking, and this one is a
  // ranking on one measured number.
  const late = useMemo(
    () =>
      reply.rows
        .map((row) => ({ row, due: readRowDue(row, now) }))
        .filter((entry) => entry.due.late)
        .sort((a, b) => (b.due.lateMs ?? 0) - (a.due.lateMs ?? 0) || (a.row.id < b.row.id ? -1 : 1))
        .map((entry) => entry.row),
    [reply.rows, now],
  )

  // ONE TEMPLATE FOR EVERY LIST ON THE PAGE, Late included, so a title at the margin starts at
  // one x in both sections. The table has its own columns, because a table is compared column by
  // column and carries what the list says in its group headings.
  const listColumns = useMemo(() => columnsFor('levels', anySized, anyHours, anyMarks), [anySized, anyHours, anyMarks])
  const tableColumns = useMemo(() => columnsFor('flat', anySized, anyHours, anyMarks), [anySized, anyHours, anyMarks])

  // HOW MANY LINES OF ALL WORK ARE DRAWN. See `WORK_LINES_DRAWN_FIRST`.
  const [drawn, setDrawn] = useState(WORK_LINES_DRAWN_FIRST)
  const lines = useMemo(() => linesOfLevels(levels, folded), [levels, folded])
  const linesInView = view === 'flat' ? reply.rows.length : lines.total
  const drawMore = useMemo(() => () => setDrawn((was) => was + WORK_LINES_DRAWN_EACH_STEP), [])
  const drawAll = useMemo(() => () => setDrawn(Number.POSITIVE_INFINITY), [])

  const toggle = (key: string) =>
    setFolded((was) => {
      const next = new Set(was)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  if (reply.counted === 0) {
    return <Absence title={t('g7a.work.none')} />
  }

  const lateWork = (
    <>
      {/* LATE, FIRST, IN THE ASK COLOUR (shared rule R6). It is called what it holds, work past its date.
          It was "Needs you" until wave 13q's round 28, a name Home's waiting queue keeps for the decisions
          and questions put to the person (problem uyvrTRyshEJ6). A row here is also drawn under All
          work: this section is a way in to a few rows, not a second list. It is the same row
          component reading the same reader, so the two drawings cannot say different things about
          one date. Its rows reserve the fold press's room as the By level rows do, so a title at
          the margin starts at one x in both sections. */}
      <section className="wk-sec wk-late" data-section="late" {...declaredAttributes({ surface: 'work.late' })}>
        <h2 className="wk-head">
          <span data-title-is="its-label" {...DRAWS_THE_NAME}>{t('workPage.late')}</span>
          {late.length === 0 ? null : <span className="wk-count num">{late.length}</span>}
        </h2>
        {late.length === 0 ? (
          <p className="wk-quiet">{t('workPage.nothingLate')}</p>
        ) : (
          <div className="wk-list" style={gridVar(listColumns)}>
            {late.map((row) => (
              <WorkRowView
                key={row.id}
                row={row}
                depth={0}
                columns={listColumns}
                view="levels"
                names={names}
                inspect={inspect}
                now={now}
                sayProject
              />
            ))}
          </div>
        )}
      </section>

      {/* HOW MANY ROWS COULD BE LATE AT ALL, in developer mode: the denominator of Late. */}
      {inspect ? <p className="wk-note">{dueCensusSentences(census).join(' ')}</p> : null}
    </>
  )

  return (
    <div className="wk-page">
      {reply.leftOut > 0 ? (
        <Panel titleIs="label" declares={{ surface: 'work.cut' }} title={t('g7a.work.cutTitle')} rank={0} tone="failed">
          <p className="wk-note">{t('g7a.work.cut', { n: reply.leftOut })}</p>
        </Panel>
      ) : null}

      {levels.contradictions.length > 0 ? (
        <Panel titleIs="label" declares={{ surface: 'work.disagree' }} title={t('g7a.work.conflictTitle')} rank={0} tone="failed">
          <ul className="wk-said">
            {levels.contradictions.map((said) => (
              <li key={said}>{inspect ? said : t('g7a.work.conflict')}</li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* LATE AND ALL WORK FOLLOW THE PRODUCT'S ONE WIDTH RULE, components/SideBySide.tsx. When
          something is late, Late is the column beside All work on a wide screen, and above it
          on a narrower one, which is why it is written first. When nothing is, its one quiet line
          stands above All work and there is no second column, because a column holding one quiet
          line is a stranded band. */}
      <SideBySide className="wk-sides">
        <div className="wk-side" data-column="end">
          {late.length === 0 ? null : lateWork}
        </div>
        <div className="wk-main" data-column="start">
          {late.length === 0 ? lateWork : null}
          <section className="wk-sec wk-all" data-section="all-work" {...declaredAttributes({ surface: 'work.all' })}>
            <div className="wk-all-head">
              <h2 className="wk-head">
                <span data-title-is="its-label" {...DRAWS_THE_NAME}>{t('workPage.allWork')}</span>
                <span className="wk-count num">{reply.returned}</span>
              </h2>
              {/* THE SECTION'S ONE CONTROL: which view. Position and colour both say which is chosen. */}
              <div className="wk-seg" role="group" aria-label={t('g7a.work.arrange')}>
                {WORK_VIEWS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={option === view}
                    onClick={() => setView(option)}
                  >
                    {WORK_VIEW_WORDS[option].label}
                  </button>
                ))}
              </div>
            </div>

            {view === 'flat' ? (
              <WorkTable rows={reply.rows.slice(0, drawn)} columns={tableColumns} names={names} inspect={inspect} now={now} />
            ) : (
              <div className="wk-groups">
                {levels.projects.map((project, index) => {
                  const placed = lines.projects[index]!
                  if (placed.start >= drawn) return null
                  const named = projectName(project.workspaceId, names)
                  return (
                    <section key={project.workspaceId} className="wk-group" data-project={project.workspaceId}>
                      <h3 className="wk-group-head">
                        <span>{named.unknown ? t('g7a.work.unknownProject') : named.text}</span>
                        <span className="wk-count num">{project.count}</span>
                      </h3>
                      {inspect && named.unknown ? <p className="wk-note">{named.why}</p> : null}
                      <div className="wk-list" style={gridVar(listColumns)}>
                        {project.roots.map((node) => (
                          <NodeRows
                            key={node.key}
                            node={node}
                            depth={0}
                            columns={listColumns}
                            names={names}
                            folded={folded}
                            onToggle={toggle}
                            inspect={inspect}
                            now={now}
                            at={placed.at}
                            drawn={drawn}
                          />
                        ))}
                        {project.unreadable.length > 0 && placed.unreadableStart < drawn ? (
                          <>
                            <div className="wk-level wk-level-broken">
                              <span className="wk-toggle-gap" />
                              <span className="wk-level-title">{t('g7a.work.parentUnavailable')}</span>
                              <span className="wk-under">{t('g7a.work.pieces', { n: project.unreadable.length })}</span>
                            </div>
                            {project.unreadable.slice(0, drawn - placed.unreadableStart - 1).map((row) => (
                              <WorkRowView
                                key={row.id}
                                row={row}
                                depth={1}
                                columns={listColumns}
                                view="levels"
                                names={names}
                                inspect={inspect}
                                now={now}
                              />
                            ))}
                          </>
                        ) : null}
                      </div>
                    </section>
                  )
                })}
              </div>
            )}
            {linesInView > drawn ? <TheRestAsYouScroll key={drawn} drawn={drawn} total={linesInView} onMore={drawMore} onAll={drawAll} /> : null}
          </section>
        </div>
      </SideBySide>

      {/* WHAT A ROW WITH NO MARK MEANS, and it is drawn exactly when a row could have carried one.
          The rows draw the origin mark on the exceptions only, so without this sentence the absence
          of a mark would mean two things at once — "ordinary authored work" and "nobody has said" —
          and the second is the one that lets made-up content read as real. The server's kinds and order
          sentences are developer detail, drawn only there; its note for agents is not drawn. */}
      <div className="fam-foot">
        {anyMarks ? <UnmarkedRowsNote what={t('sheet.row')} /> : null}
        {inspect ? <p className="fam-excl">{`${reply.kindsBecause} ${reply.order}`}</p> : null}
      </div>
    </div>
  )
}

// ============================================================================ the columns

interface Column {
  key: 'state' | 'name' | 'part' | 'size' | 'hours' | 'project' | 'marks'
  /** The heading, in the reader's words. Drawn at the head of the table. */
  head: string
  /** The column's width in the By level list's grid. The table sizes its own columns. */
  width: string
}

/**
 * The columns each view draws.
 *
 * A COLUMN NOBODY COULD FILL IS ABSENT, NOT BLANK. When no row has an estimate, a *How big* column
 * would be a column of empty cells, and an empty cell claims "nothing is there" when the truth is
 * "nobody looked". The same test is applied to hours.
 *
 * `anyMarks` IS THE SAME TEST ON A DIFFERENT KIND OF ANSWER. The marks column holds the exceptions
 * — a made-up example, a row nobody has stamped, a record with a field nobody filled in — so its
 * empty cells are not absences: they are ordinary authored, complete rows, and the sentence at the
 * foot says so. When no row carries any mark at all there is nothing for the column to hold and it
 * goes, along with that sentence.
 */
export function columnsFor(view: WorkView, anySized: boolean, anyHours: boolean, anyMarks: boolean): Column[] {
  return [
    // THE WIDTH IS `FAMILY_SEV`, NOT A SECOND COPY OF IT. rows.tsx says the fixed first column is
    // stated once and nowhere else.
    { key: 'state', get head(): string { return t('g7a.work.where') }, width: FAMILY_SEV },
    { key: 'name', get head(): string { return t('g7a.work.what') }, width: 'minmax(0, 1fr)' },
    // WHAT IT IS PART OF, AS A COLUMN, IN THE TABLE ONLY. The list shows it by grouping instead.
    ...(view === 'flat' ? ([{ key: 'part', get head(): string { return t('g7a.work.partOf') }, width: 'minmax(0, 1fr)' }] as Column[]) : []),
    ...(anySized ? ([{ key: 'size', get head(): string { return t('g7a.work.size') }, width: '6rem' }] as Column[]) : []),
    ...(anyHours ? ([{ key: 'hours', get head(): string { return t('g7a.work.time') }, width: 'minmax(0, 12rem)' }] as Column[]) : []),
    // THE PROJECT COLUMN IS FOR THE VIEW THAT MIXES PROJECTS, AND ONLY THAT ONE. The list groups by
    // project and names each group once in its heading, so a project on every row would repeat it.
    // The one thing a grouped row can say that its heading cannot — that what it is part of lives
    // in ANOTHER project — is drawn beside the title in both views.
    ...(view === 'flat' ? ([{ key: 'project', get head(): string { return t('g7a.work.project') }, width: 'auto' }] as Column[]) : []),
    // NAMED FOR WHAT IT HOLDS, which is facts about the RECORD rather than about the work: how it
    // got here, and how much of it nobody has filled in.
    ...(anyMarks ? ([{ key: 'marks', get head(): string { return t('g7a.work.aboutRecord') }, width: 'auto' }] as Column[]) : []),
  ]
}

function gridVar(columns: readonly Column[]): React.CSSProperties {
  return { '--wk-cols': columns.map((column) => column.width).join(' ') } as unknown as React.CSSProperties
}

// ============================================================================ one level, drawn

function NodeRows({
  node,
  depth,
  columns,
  names,
  folded,
  onToggle,
  inspect,
  now,
  at,
  drawn,
}: {
  node: WorkNode
  depth: number
  columns: readonly Column[]
  names: ReadonlyMap<string, string>
  folded: ReadonlySet<string>
  onToggle: (key: string) => void
  inspect: boolean
  now: number
  /** Each line's place down the list, from `linesOfLevels`. */
  at: ReadonlyMap<string, number>
  /** How many lines are drawn. A level past them is not drawn, and nor is anything under it. */
  drawn: number
}) {
  if ((at.get(node.key) ?? Number.POSITIVE_INFINITY) >= drawn) return null
  const shut = folded.has(node.key)
  const hasParts = node.children.length > 0
  const parts = hasParts ? (
    shut ? null : (
      <>
        {node.children.map((child) => (
          <NodeRows
            key={child.key}
            node={child}
            depth={depth + 1}
            columns={columns}
            names={names}
            folded={folded}
            onToggle={onToggle}
            inspect={inspect}
            now={now}
            at={at}
            drawn={drawn}
          />
        ))}
      </>
    )
  ) : null

  const fold = hasParts ? (
    <button
      type="button"
      className="wk-toggle"
      aria-expanded={!shut}
      onClick={() => onToggle(node.key)}
      title={shut ? t('g7a.work.showParts') : t('g7a.work.hideParts')}
    >
      <span aria-hidden="true">{shut ? '▸' : '▾'}</span>
      <span className="px-sr">{shut ? t('g7a.work.showParts') : t('g7a.work.hideParts')}</span>
    </button>
  ) : (
    <span className="wk-toggle-gap" />
  )

  // A LEVEL THAT IS NOT ITSELF WORK is a heading over its parts, not a row in a list of things to
  // do. Drawing a pipeline in the state column would put a thing nobody can do in a column of
  // things somebody has to.
  if (node.row === null) {
    const step = node.step
    const unread = step !== null && step.kind === null
    return (
      <>
        <div className="wk-level" style={indent(depth)}>
          {fold}
          {unread || step === null ? (
            <span className="wk-level-title wk-broken">{inspect ? step?.title ?? node.key : t('g7a.work.missingParent')}</span>
          ) : (
            <a className="px-nav wk-level-title" href={`#${recordPath(node.key)}`}>
              {step.title}
            </a>
          )}
          {step !== null && step.kind !== null ? <Tag kind={step.kind} tone="quiet" /> : null}
          {step?.deleted === true ? (
            <Tag tone="warn" title={t('g7a.work.deletedHint')}>
              {t('g7a.records.deleted')}</Tag>
          ) : null}
          <span className="wk-under">
            {shut ? t('g7a.work.hiddenPieces', { n: node.workCount }) : t('g7a.work.underPieces', { n: node.workCount })}
          </span>
          {inspect ? <span className="wk-raw">{step?.via}</span> : null}
        </div>
        {parts}
      </>
    )
  }

  return (
    <>
      <WorkRowView
        row={node.row}
        depth={depth}
        columns={columns}
        view="levels"
        names={names}
        inspect={inspect}
        now={now}
        fold={fold}
      />
      {parts}
    </>
  )
}

/**
 * ONE INDENT STEP AND NEVER MORE (shared rule R1: the margin and one step in).
 *
 * The group heading names the project; what sits under nothing starts at the margin, and every part
 * of anything starts one step in, however deep it sits. The parent's fold press is what says which
 * parts are whose, and folding it hides them.
 */
export function indentStep(depth: number): 0 | 1 {
  return depth > 0 ? 1 : 0
}

function indent(depth: number): React.CSSProperties {
  return { '--wk-in': String(indentStep(depth)) } as unknown as React.CSSProperties
}

// ============================================================================ one piece of work

/** What each column holds for one row. The name is drawn by the caller, which knows its view. */
function cellsOf(row: WorkPageRow, names: ReadonlyMap<string, string>, inspect: boolean, now: number): Record<Exclude<Column['key'], 'name'>, React.ReactNode> {
  const project = projectName(row.workspaceId, names)
  return {
    state: <StateOf row={row} due={readRowDue(row, now)} />,
    part: <PartOf row={row} inspect={inspect} />,
    size:
      row.estimateHours === null ? (
        // NEVER 0h. Zero would mean somebody looked and said it takes no time.
        <Absence />
      ) : (
        <b className="num">{t('g7a.work.hours', { n: row.estimateHours })}</b>
      ),
    hours:
      row.hoursGiven.length === 0 ? (
        <Absence />
      ) : (
        // HOURS AT DIFFERENT GRAINS ARE NEVER ADDED. A month, a week inside it and a day inside that
        // are three answers to three questions, so every period is listed.
        row.hoursGiven.map((given) => (
          <span key={`${given.horizon}-${given.period}`} className="wk-given">
            {given.plannedHours === null ? <Absence /> : <b className="num">{t('g7a.work.hours', { n: given.plannedHours })}</b>}{' '}
            <span>{given.period}</span>
          </span>
        ))
      ),
    project: (
      <Tag tone={project.unknown ? 'warn' : 'quiet'} title={project.unknown && inspect ? project.why : undefined}>
        {project.unknown && !inspect ? t('g7a.work.unknownProject') : project.text}
      </Tag>
    ),
    // THE TWO MARKS A ROW MAY NEVER FOLD AWAY, from the one component all six family pages draw
    // them with, at the row's right edge because their width differs per row.
    marks: <RowMarks record={row} />,
  }
}

/**
 * Where a piece of work stands: its stored word with how late it is, or what stands in for a word.
 *
 * A KIND WITH NO STATE FIELD IS THE SHORT MARK. Nothing is missing and nothing is to be done, so
 * the row draws the plain dash with its reason on hover (plan 7FEOshq3mBGG, block b-6, check 4).
 * A kind that HAS a state field and none written, and a kind Mole Office does not know, are still
 * told apart by `NoStateMark`, because each of those is something a person may want to act on.
 */
function StateOf({ row, due }: { row: WorkPageRow; due: RowDue }) {
  if (row.state === null) {
    const expected = kindDeclaresState(row.kind)
    if (expected === false) {
      return (
        <>
          <Absence title={t('workPage.noStateHint')} />
          {due.said === null ? null : <span className="wk-due">{due.said.text}</span>}
        </>
      )
    }
    // THE DATE STILL GETS SAID, in the mark's own note line, because an obligation can be owed by
    // a date with nobody having written a state.
    return <NoStateMark expected={expected} {...(due.said === null ? {} : { note: due.said.text })} />
  }
  // THE LATENESS RIDES ON THE STORED WORD, which is where every other surface in this product puts
  // it: one object, one urgency mark.
  return (
    <StoredState
      state={row.state}
      source={row.stateSource}
      progress={progressOf(row.state)}
      kind={row.kind}
      {...(due.said === null ? {} : { count: due.said.text, countKind: due.said.kind })}
    />
  )
}

/** The title and what is said beside it: the kind, and the exceptions about this one row. */
function NameOf({ row, names, inspect, sayProject }: { row: WorkPageRow; names: ReadonlyMap<string, string>; inspect: boolean; sayProject?: boolean }) {
  const project = projectName(row.workspaceId, names)
  return (
    <>
      <a className="px-nav wk-title" href={`#${recordPath(row.id, row.kind)}`}>
        {row.name}
      </a>
      <Tag kind={row.kind} tone="quiet" />
      {/* WHICH PROJECT, on a row in a section that mixes projects and has no project column. */}
      {sayProject === true ? (
        <Tag tone={project.unknown ? 'warn' : 'quiet'}>{project.unknown && !inspect ? t('g7a.work.unknownProject') : project.text}</Tag>
      ) : null}
      {row.aboveStopped === null ? null : (
        <Tag tone="warn" title={inspect ? row.aboveStopped : t('g7a.work.chainHint')}>
          {t('g7a.work.chainIncomplete')}</Tag>
      )}
      {/* WHAT THIS IS PART OF LIVES IN ANOTHER PROJECT — an exception about this row, so it is
          beside the title in both views. Links may not cross a project boundary today; rows written
          before that refusal existed are still stored. */}
      {row.parentsInOtherProjects.length === 0 ? null : (
        <Tag tone="warn" title={t('g7a.work.otherProject')}>
          {t('g7a.work.alsoIn', { projects: row.parentsInOtherProjects.map((id) => names.get(id) ?? t('g7a.work.unknownProject')).join(', ') })}
        </Tag>
      )}
      {inspect ? <span className="wk-raw">{row.id}</span> : null}
    </>
  )
}

function WorkRowView({
  row,
  depth,
  columns,
  view,
  names,
  inspect,
  now,
  fold,
  sayProject,
}: {
  row: WorkPageRow
  depth: number
  columns: readonly Column[]
  view: WorkView
  names: ReadonlyMap<string, string>
  inspect: boolean
  /** The one clock the page measures every row against. */
  now: number
  /** The press that folds this row's parts, when it has any. A fixed-width gap when it has none. */
  fold?: React.ReactNode
  /** Name the row's project beside its title, for Late, which mixes projects. */
  sayProject?: boolean
}) {
  const cells = cellsOf(row, names, inspect, now)
  // THE FACTS AFTER THE TITLE ARE ONE CELL OF THEIR OWN, so a narrow row can put them on the
  // line under the title while a wide row still lays them in their columns. `wk-after` draws
  // its children straight into the row's grid on a wide row (display: contents).
  const stateColumns = columns.filter((column) => column.key === 'state')
  const nameColumn = columns.find((column) => column.key === 'name')
  const facts = columns.filter((column) => column.key !== 'state' && column.key !== 'name')
  const factCell = (column: Column): React.ReactNode => {
    if (column.key === 'name') return null
    return (
      <span key={column.key} className={`wk-c wk-${column.key}`}>
        {cells[column.key]}
      </span>
    )
  }
  return (
    <div
      className="wk-row"
      // THE ROW IS THE PIECE OF WORK, so a press anywhere on it can be talked about. The row
      // carries the record's OWN project, because this list spans every project.
      {...targetAttributes({ kind: 'record', recordId: row.id, workspaceId: row.workspaceId })}
    >
      {stateColumns.map(factCell)}
      {nameColumn === undefined ? null : (
        <span key="name" className="wk-c wk-name" style={indent(view === 'levels' ? depth : 0)}>
          {view === 'levels' ? (fold ?? <span className="wk-toggle-gap" />) : null}
          <NameOf row={row} names={names} inspect={inspect} {...(sayProject === true ? { sayProject } : {})} />
        </span>
      )}
      {facts.length === 0 ? null : <span className="wk-after">{facts.map(factCell)}</span>}
    </div>
  )
}

/**
 * ONE LIST IS A TABLE (report n9Mjk3c_sJRu, block b-13): every piece of work as one row, compared
 * column by column, with what it is part of and its project in columns of their own. On a narrow
 * screen the table scrolls sideways inside its own box, and nothing else on the page does.
 */
function WorkTable({
  rows,
  columns,
  names,
  inspect,
  now,
}: {
  rows: readonly WorkPageRow[]
  columns: readonly Column[]
  names: ReadonlyMap<string, string>
  inspect: boolean
  now: number
}) {
  return (
    // THE TABLE SAYS WHEN IT CARRIES ON PAST AN EDGE: InReach draws a rule and a fade on that side.
    <InReach box="wk-scroll" name={t('workPage.table')} shape={String(rows.length)}>
      <table className="wk-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`wk-th wk-td-${column.key}`}>
                {column.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const cells = cellsOf(row, names, inspect, now)
            return (
              <tr key={row.id} className="wk-tr" {...targetAttributes({ kind: 'record', recordId: row.id, workspaceId: row.workspaceId })}>
                {columns.map((column) => (
                  <td key={column.key} className={`wk-td wk-td-${column.key}`}>
                    {column.key === 'name' ? <NameOf row={row} names={names} inspect={inspect} /> : cells[column.key]}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </InReach>
  )
}

/** The whole path, outermost first, in its own column of the table. */
function PartOf({ row, inspect }: { row: WorkPageRow; inspect: boolean }) {
  if (row.above.length === 0) {
    return row.aboveStopped === null ? (
      <Absence />
    ) : (
      <span className="wk-broken">{inspect ? row.aboveStopped : t('g7a.work.chainHint')}</span>
    )
  }
  return (
    <>
      {row.above.map((step, at) => (
        <span key={step.id} className="wk-step">
          {at === 0 ? null : <span className="wk-arrow" aria-hidden="true">{'›'}</span>}
          {step.kind === null ? (
            <span className="wk-broken">{inspect ? step.title : t('g7a.work.missingParent')}</span>
          ) : (
            <a className="px-nav" href={`#${recordPath(step.id, step.kind ?? undefined)}`}>
              {step.title}
            </a>
          )}
          {step.deleted === true ? <span className="wk-broken"> {t('g7a.work.deletedBracket')}</span> : null}
          {inspect ? <span className="wk-raw">{step.via}</span> : null}
        </span>
      ))}
      {row.aboveStopped === null ? null : <span className="wk-broken">{inspect ? row.aboveStopped : t('g7a.work.chainHint')}</span>}
    </>
  )
}

// ============================================================================ project names

/**
 * The project's own name, or its id and the reason there is no name.
 *
 * NEVER SILENTLY THE ID. An id drawn where a name belongs reads as a name, and the reader has no
 * way to tell that Mole Office has no project by that id — which is a real thing to go and fix.
 *
 * IT DOES NOT DECIDE WHAT A PROJECT IS CALLED. `projectName` in src/web/lib/projects.ts does, and
 * it is the only function in the browser that does. This one only adds the second answer that
 * function has no way to give: whether the reply that lists the projects held this id at all.
 *
 * IT USED TO PRINT THE STORED TITLE AND THAT WAS THE DEFECT. The catch-all project's stored title
 * is "Unassigned", so this page headed a group "Unassigned" while the project switcher four inches
 * away said "Not in a project" — one bucket with two names, worked out in two places, and nothing
 * failed when they disagreed. tests/work-page.test.ts now fails if this page prints the stored word.
 */
export function projectName(
  workspaceId: string,
  names: ReadonlyMap<string, string>,
): { text: string; unknown: boolean; why: string } {
  const stored = names.get(workspaceId)
  if (stored !== undefined) return { text: onScreen(workspaceId, stored), unknown: false, why: '' }
  return {
    text: onScreen(workspaceId),
    unknown: true,
    why:
      t('g7a.work.unknownProjectDetail', { id: workspaceId }),
  }
}

// ============================================================================ styles

/**
 * The name `FamilyPage` imports and hoists into its one stylesheet, kept so this page's sheet is
 * still one element however often it renders. It is not injected here.
 */
export const WORK_CSS = `
/* ------------------------------------------------------------------ the page and its two sections
   A section is not a box (shared rule R10): a heading, then its rows, split by hairlines. The page
   measures its own width, so the groups can stand side by side where there is room. */
.wk-page { display: flex; flex-direction: column; gap: calc(var(--gut) * 2); min-width: 0; container-type: inline-size; container-name: wkpage; }
/* THE TWO COLUMNS, from the product's one width rule (components/SideBySide.tsx): All work, and
   Late beside it when something is. Each column measures its own width, so a row in the
   narrower column takes the form it takes on a phone rather than being squeezed. */
.wk-sides { gap: calc(var(--gut) * 2); }
.wk-main, .wk-side { display: flex; flex-direction: column; gap: calc(var(--gut) * 2); min-width: 0; container-type: inline-size; container-name: wkpage; }
.wk-sec { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.wk-head {
  margin: 0; display: flex; align-items: baseline; gap: var(--pad);
  font-family: var(--section-font); font-size: var(--panel-title-size); font-weight: var(--section-weight);
  text-transform: var(--section-case); letter-spacing: var(--section-space); line-height: var(--lh-tight);
  color: var(--text);
}
.wk-late .wk-head { color: var(--ask); }
.wk-count { font-size: var(--fs-1); font-weight: 600; color: var(--text-3); letter-spacing: 0; text-transform: none; font-variant-numeric: tabular-nums; }
.wk-quiet { margin: 0; color: var(--text-3); font-size: var(--fs-2); }
.wk-more { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--gut); font-size: var(--fs-1); color: var(--text-3); }
/* NEEDS YOU STANDS IN THE SAME COLUMNS AS THE GROUPS BELOW, so its rows are as short as theirs and
   its titles start where theirs do. Most late first, read along each line. */
.wk-late .wk-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 32rem), 1fr)); column-gap: calc(var(--gut) * 2); }
.wk-late .wk-row { background: var(--ask-row); box-shadow: inset 0 1px 0 var(--border); }
.wk-all-head { display: flex; align-items: center; justify-content: space-between; gap: var(--gut); flex-wrap: wrap; min-width: 0; }

/* ------------------------------------------------------------------ the switch
   Position AND colour say which one is chosen, so the choice survives a mono theme. */
.wk-seg { display: inline-flex; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); overflow: hidden; }
.wk-seg button {
  appearance: none; border: 0; cursor: pointer;
  min-height: 32px; padding: 4px 12px;
  background: var(--panel); color: var(--text-2);
  font: 500 var(--fs-2)/var(--lh-tight) var(--font-ui);
}
.wk-seg button + button { border-left: var(--border-w) solid var(--border-strong); }
.wk-seg button:hover { background: var(--hover); color: var(--text); }
.wk-seg button[aria-pressed="true"] { background: var(--accent); color: var(--accent-text); font-weight: 600; }
.wk-seg button:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: -2px; }

/* ------------------------------------------------------------------ By level: groups side by side
   THE WIDTH IS USED SIDE BY SIDE. Where two groups of at least 32rem fit,
   the projects stand in columns, so a row is read in one short line rather than across the whole
   window. Narrower, they stack. */
.wk-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 32rem), 1fr)); gap: calc(var(--gut) * 2) calc(var(--gut) * 2); align-items: start; min-width: 0; }
.wk-group { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.wk-group-head {
  margin: 0; display: flex; align-items: baseline; gap: var(--pad);
  font-size: var(--fs-3); font-weight: 600; line-height: var(--lh-tight); color: var(--text);
  overflow-wrap: anywhere;
}
.wk-group .wk-list { border-top: 1px solid var(--border); }

/* ------------------------------------------------------------------ the list
   ONE GRID TEMPLATE FOR EVERY ROW IN A LIST, held on the container, so a title cannot start at a
   different x from the title above it. */
.wk-list { display: flex; flex-direction: column; min-width: 0; container-type: inline-size; container-name: wklist; }
.wk-row {
  display: grid;
  grid-template-columns: var(--wk-cols);
  align-items: baseline;
  column-gap: var(--gut);
  row-gap: 2px;
  padding: 6px var(--pad);
  min-width: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
}
.wk-row > * { min-width: 0; }
.wk-row + .wk-row, .wk-level + .wk-row, .wk-row + .wk-level { box-shadow: inset 0 1px 0 var(--border); }
.wk-row:hover { background: var(--hover); }

.wk-c { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; min-width: 0; }
.wk-state { align-items: center; }
/* THE ONE THING THAT MOVES THE TITLE, and it moves it by one step of 16px at most (shared rule R1).
   The cell does not wrap: the title breaks inside itself, and what follows it keeps its own width,
   so a long title never drops onto a line of its own further left. The kind sits right after the
   title rather than at the far edge, so the eye does not cross the row to read one item. */
.wk-name { padding-left: calc(var(--wk-in, 0) * 16px); flex-wrap: nowrap; }
.wk-name > * { flex: none; }
.wk-title { flex: 0 1 auto; min-width: ${WORK_TITLE_MIN}; color: var(--text); overflow-wrap: anywhere; }
/* THE FACTS ARE THEIR OWN CELL, so a narrow row can move them as one under the title. On a wide
   row they go straight into the row's grid, exactly where their own columns put them. */
.wk-after { display: contents; }
.wk-hours { color: var(--text-2); }
.wk-size, .wk-hours { font-variant-numeric: tabular-nums; }
.wk-marks { justify-content: flex-end; align-items: center; }
.wk-due { font-size: var(--fs-1); color: var(--text-2); }

/* The press that folds a level, and the gap that keeps the title in line when there is none. */
.wk-toggle, .wk-toggle-gap { flex: none; width: 18px; text-align: center; }
.wk-toggle {
  appearance: none; border: 0; background: none; cursor: pointer; padding: 0;
  color: var(--text-3); font-size: var(--fs-2); line-height: 1;
}
.wk-toggle:hover { color: var(--text); }
.wk-toggle:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: 2px; border-radius: var(--radius-sm); }

/* A level that is not work: a heading over its parts, spanning the whole width, so nothing that is
   not a piece of work ever appears in the column of things somebody has to do. */
.wk-level {
  display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap;
  padding: 8px var(--pad) 4px;
  padding-left: calc(var(--pad) + var(--wk-in, 0) * 16px);
  min-width: 0;
  font-size: var(--fs-2); line-height: var(--lh-tight);
}
.wk-level-title { font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
.wk-under { font-size: var(--fs-1); color: var(--text-3); font-variant-numeric: tabular-nums; }
.wk-level-broken .wk-level-title { color: var(--st-failed); }

.wk-broken { color: var(--st-failed); overflow-wrap: anywhere; }
.wk-step { display: inline-flex; align-items: baseline; gap: 4px; min-width: 0; }
.wk-arrow { color: var(--text-3); }
.wk-given { display: inline-flex; align-items: baseline; gap: 4px; flex-wrap: wrap; min-width: 0; overflow-wrap: anywhere; }

/* Raw stored words and ids: developer mode only, and conditionally rendered. */
.wk-raw { font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text-3); }

.wk-note {
  margin: 0; padding: 0;
  font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-2);
}
.wk-said { margin: 0; padding-left: 1.2em; font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-2); }

/* ------------------------------------------------------------------ One list: the table
   The full width, with the columns compared down the page. It scrolls sideways inside its own box
   when the screen is narrower than the table (shared rule R8), and nothing else on the page does. */
.wk-scroll { overflow-x: auto; min-width: 0; }
.wk-table { width: 100%; min-width: 52rem; border-collapse: collapse; font-size: var(--fs-2); line-height: var(--lh-tight); }
.wk-th {
  text-align: left; vertical-align: bottom; padding: 4px var(--pad) 6px;
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  border-bottom: 1px solid var(--border-strong); white-space: nowrap;
}
.wk-td { text-align: left; vertical-align: baseline; padding: 6px var(--pad); border-bottom: 1px solid var(--border); }
.wk-tr:hover { background: var(--hover); }
.wk-td-state { width: 1%; white-space: nowrap; }
/* A state and its lateness on one line: the cell is as narrow as the widest chip, not narrower. */
.wk-td-state .px-chip { width: max-content; max-width: none; }
.wk-td-name .wk-title { margin-right: 6px; }
.wk-td-name > * + * { margin-left: 6px; }
.wk-td-part { color: var(--text-2); }
.wk-td-part .wk-step + .wk-step { margin-left: 4px; }
.wk-td-size, .wk-td-hours, .wk-td-project { white-space: nowrap; }
.wk-td-marks { text-align: right; }

/* ------------------------------------------------------------------ narrow
   THE COLUMNS STACK RATHER THAN SQUEEZE. Down to 30rem of list the state keeps its fixed cell and
   everything else stacks under the title; below that the state goes on its own line too. */
@container wklist (width <= 52rem) {
  .wk-row { grid-template-columns: 9.5rem minmax(0, 1fr); }
  .wk-row > .wk-state { grid-column: 1; grid-row: 1 / span 2; align-self: start; }
  .wk-row > .wk-name { grid-column: 2; grid-row: 1; flex-wrap: wrap; }
  .wk-row > .wk-after { display: flex; grid-column: 2; grid-row: 2; flex-wrap: wrap; align-items: baseline; gap: 2px var(--gut); }
}
@container wkpage (width < 30rem) {
  .wk-row { grid-template-columns: minmax(0, 1fr); }
  .wk-row > * { grid-column: 1; }
  .wk-row > .wk-state, .wk-row > .wk-name, .wk-row > .wk-after { grid-column: 1; grid-row: auto; }
  .wk-name { flex-wrap: wrap; }
  .wk-marks { justify-content: flex-start; }
}
`
