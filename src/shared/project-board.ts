// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE PROJECT BOARD ANSWERS: one row for each architecture block, worked out from records and links when it is
 * asked, and nothing stored.
 *
 * `GET /api/projects/<project>/board` answers it. src/server/lib/project-board.ts is the one place it is worked out,
 * and the page draws it. Each value says where it came from in its field's comment.
 */

/** Which pipeline is a project's master, as src/server/lib/master-pipeline.ts reads it. */
export type TheMasterPipeline =
  | { project: string; state: 'marked'; id: string; title: string }
  | { project: string; state: 'unmarked' }
  | { project: string; state: 'broken'; id: string; because: WhyTheMarkIsBroken }

/** Why the record the project's mark names cannot be the master now. */
export type WhyTheMarkIsBroken = 'not there' | 'deleted' | 'not a pipeline' | 'in another project'

/**
 * THE GROUPS A ROW IS SORTED INTO, in the order the board shows them: what most needs a person comes first. Each row
 * is in the first group that holds for it, except that a row with no pipeline under it is always in the last one.
 *
 *   nobody-on-it     unfinished steps, no run acting under the row, and every acting run is under some row
 *   stalled          a step under the row has stopped short: blocked or failed, and no live pause holds it
 *   not-known        unfinished steps and no run acting under the row, while some acting run is under no row,
 *                    so one of those may be on it
 *   moving-or-done   no unfinished step, or a run acting under the row
 *   no-pipeline      no pipeline is part of the row's step
 */
export const BOARD_GROUPS = ['nobody-on-it', 'stalled', 'not-known', 'moving-or-done', 'no-pipeline'] as const

export type BoardGroup = (typeof BOARD_GROUPS)[number]

/** A record named on the board, by id and title. */
export interface BoardRecord {
  id: string
  title: string
}

/** One unfinished step under a row. */
export interface BoardStep extends BoardRecord {
  /** The step's own state word: `todo`, `doing`, `blocked` or `failed`. */
  state: string
  /** The pipeline the step is in. */
  pipeline: BoardRecord
  /**
   * Since when the step has held this state, dated as the attention list dates it: its newest change of `data.state`
   * to this word, or, when no change row records one, its own updated stamp, which can only make the age shorter.
   */
  since: string
  sinceFrom: 'state-change' | 'record-updated'
  /** Whole days from `since` to the board's `at`. */
  days: number
  /** Whether it has stopped short, by `theWorkHasStoppedShort` in src/shared/work.ts, the attention list's rule. */
  stalled: boolean
}

/** One run that acts now. */
export interface BoardRun extends BoardRecord {
  /** The handle it serves, `data.servingAgent`, or null when the run names none. */
  agent: string | null
  /** The line read from that handle by `theLineOfAHandle`, or null when the handle gives none. */
  line: string | null
  /** Its newest request to the office. */
  newestRequest: string
}

/** One open package: a task with `data.package` whose work has not ended. */
export interface BoardPackage extends BoardRecord {
  /** `package.lines`, as stored. */
  lines: string[]
}

/** One backlog item in state `todo` or `doing`. */
export interface BoardBacklogItem extends BoardRecord {
  line: string
  state: 'todo' | 'doing'
}

/** One landing on main: a queue commit or a merge commit on main's first-parent line. */
export interface BoardLanding {
  commit: string
  at: string
  subject: string
  /** `queue`: a commit with the queue's `Mole-landing:` footer. `merge`: a merge commit. */
  how: 'queue' | 'merge'
  /**
   * The lines whose work it landed, read from handles: for a queue commit, the handle of the run its `Run:` footer
   * names; for a merge, the author names of the commits it brought in. Empty when none gives a line. Read only for
   * the landings of the last 24 hours, which view B shows; null for the others.
   */
  lines: string[] | null
  /** The rows its changed files reach through the dictionary, by step id. Empty means no row. */
  rows: string[]
}

/** One row: one step of the master pipeline. */
export interface BoardRow extends BoardRecord {
  group: BoardGroup
  /** Every pipeline that is part of this step, at any depth. */
  pipelines: BoardRecord[]
  /** The unfinished steps of those pipelines, oldest state first. */
  unfinished: BoardStep[]
  /** The runs acting now that are part of, or relate to, a pipeline, a step or a module of this row. */
  acting: BoardRun[]
  /** The distinct handles among them. */
  agents: string[]
  /** Open packages that name a module of this row, or carry a backlog item whose files reach it. */
  packages: BoardPackage[]
  /** Backlog items in state `todo` or `doing` whose files reach this row. */
  backlog: BoardBacklogItem[]
  /** Landings of the last 7 days whose files reach this row, and the newest one's time; null when not read. */
  landings7Days: number | null
  lastLanding: string | null
}

/** One line, as view B shows it. */
export interface BoardLine {
  /** The line's name, or null for "line not recorded": what came from a run or a commit whose name gives no line. */
  line: string | null
  /** Its landings of the last 24 hours. */
  landed: BoardLanding[]
  /** Its runs acting now. */
  now: BoardRun[]
  /** Open packages whose `package.lines` name it. */
  next: BoardPackage[]
  /** Its backlog items in state `todo`. */
  later: BoardBacklogItem[]
}

/** What the landings read gave, or why it was not read. */
export type BoardLandings =
  | {
      state: 'read'
      /** The repositories read, by name, and the commit main was at. */
      repositories: { id: string; name: string; main: string }[]
      /** Landings of the last 7 days, newest first. */
      landings: BoardLanding[]
      /** The other commits on main's first-parent line in the same days: neither a queue commit nor a merge. */
      otherCommits: { commit: string; at: string; subject: string }[]
      /** Landings per day, oldest first: each local day the 7 days touch, the days with none included. */
      perDay: { day: string; landings: number }[]
    }
  | {
      state: 'not-read'
      because: 'no-repository' | 'no-folder' | 'git-did-not-answer'
      /** What git said, when it said something. */
      detail: string | null
    }

/** The whole answer of `GET /api/projects/<project>/board`. */
export interface ProjectBoard {
  project: string
  /** When it was worked out. Ages and windows are measured to this moment. */
  at: string
  master: TheMasterPipeline
  /**
   * The hours within which a run must have sent the office a request to count as acting: `idleReminderHours()`, the
   * owner's setting `MOLE_OFFICE_IDLE_REMINDER_HOURS`, the same number the idle reminder uses.
   */
  actingWithinHours: number
  /** Empty when the master is not marked, or is broken. */
  rows: BoardRow[]
  /** Runs acting now that are under no row. */
  actingUnderNoRow: BoardRun[]
  landings: BoardLandings
  /** View B: every line any part of the board names, in name order, and "line not recorded" last when anything has none. */
  lines: BoardLine[]
  /** Backlog items with no state. They are counted apart, never as open. */
  backlogWithNoState: number
}

/**
 * WHICH LINE A HANDLE OR AN AUTHOR NAME BELONGS TO: a name that starts with `wave-` or `w`, a line and a hyphen gives the line, such as
 * `13s`. Anything else gives null, which the board shows as "line not recorded". No run stores its line, so this
 * reading of the name is the only source, and it is used for runs and commit authors alike.
 */
export function theLineOfAHandle(handle: string | null): string | null {
  if (handle === null) return null
  const found = /^(?:wave-|w)(\d+[a-z]*)-/u.exec(handle.trim())
  return found === null ? null : found[1]!
}
