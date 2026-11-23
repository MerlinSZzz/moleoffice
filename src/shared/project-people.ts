// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE BOARD'S PEOPLE AND PACKAGES TAB ANSWERS: line by line, who acts now, under whom, and the packages each one
 * holds, with the line's counts of packages by state. Worked out from runs, agents and packages when it is asked, and
 * nothing stored.
 *
 * `GET /api/projects/<project>/people-and-packages` answers it. src/server/lib/project-people.ts is the one place it
 * is worked out, and the board's fourth tab draws it. Each value says where it came from in its field's comment.
 */

import type { BoardDepartment } from './departments.ts'

/** A line's packages counted by state. Each package is counted once in `all` and once in one of the other five. */
export interface PackageCounts {
  all: number
  /** `packageStateOf` gives `to_do`. */
  notTaken: number
  /** `taken`, `aligned` or `returned`. */
  inProgress: number
  /** `handed_back`: handed back and waiting for its maker. */
  handedBack: number
  /** `done`: the package's maker accepted every point. */
  accepted: number
  /** The task's own `data.state` is `blocked`, whatever state its package is in. */
  blocked: number
}

/**
 * How many agents act now, on one line or in the whole project. Each acting agent is counted once in `all` and once
 * in one of the other three, by the role card on its registry row.
 */
export interface RunningCounts {
  /** Every acting agent: the sum of the other three. */
  all: number
  /** Acting agents whose card is supervisor. */
  supervisors: number
  /** Acting agents whose card is worker. A worker counts on each line where one of its runs stands. */
  workers: number
  /** Acting agents whose card is neither supervisor nor worker, and acting agents with no card. */
  others: number
  /** Other agents by stored card name, in name order, with no card last. These counts add up to `others`. */
  otherCards: { card: string | null; count: number }[]
}

/** One package an agent holds. */
export interface PeoplePackage {
  id: string
  title: string
  /** `packageStateOf`'s word, or `not-read` when the task is not a readable package of this project. */
  state: string
  /** A supervisor's: the package's `pointIds`. A worker's: the points its run's `workerPackage` names. */
  points: string[]
}

/** One agent, with the acting runs that stand in this place. */
export interface PeopleAgent {
  /** The registry id: the run's `servingAgentId`, or the one agent its `servingAgent` names. */
  id: string
  handle: string
  name: string
  /** The agent's role card, or null when it has none. */
  post: string | null
  /** A supervisor's unaccepted packages whose newest inside take names it; empty for other cards. */
  packages: PeoplePackage[]
  /** Acting runs that stand here, never empty. */
  runs: PeopleRun[]
}

/** One acting run and the packages and workers belonging to it. */
export interface PeopleRun {
  id: string
  title: string
  /** The run's `data.startedAt`, as stored. */
  startedAt: string | null
  model: string | null
  runtime: string | null
  /** A non-supervisor run's named worker package; empty for a supervisor. */
  packages: PeoplePackage[]
  /** Workers this supervisor's run started that act now; empty for other cards. */
  workers: PeopleAgent[]
}

/** One line. */
export interface PeopleLine {
  /** The line's name, or null for "line not recorded": an agent whose handle gives no line. Always last. */
  line: string | null
  /** The department the line's code names, as the board reads it, or null for the line not recorded. */
  department: BoardDepartment | null
  /**
   * The secretary the department record names, or null when it names none. The department kind has no field that names
   * a secretary, so this is null on every line, and the tab says not recorded.
   */
  secretary: { id: string; name: string } | null
  /** The agents acting now on the line, counted by card. The tab draws the supervisors and the workers. */
  running: RunningCounts
  /** Over every package whose `package.lines` names the line, ended or not. */
  counts: PackageCounts
  /**
   * The line's supervisors acting now, each with its workers. An agent whose card is neither supervisor nor worker, or
   * that has no card, stands here too, and its post says what it is.
   */
  supervisors: PeopleAgent[]
  /** The line's workers acting now whose starting run does not act now. */
  workersUnderNoSupervisor: PeopleAgent[]
}

/** The whole answer of `GET /api/projects/<project>/people-and-packages`. */
export interface PeopleAndPackages {
  project: string
  /** When it was worked out, on the office's clock. */
  at: string
  /** The hours within which a run must have sent the office a request to act: `idleReminderHours()`, as on the board. */
  actingWithinHours: number
  /** Every line a package or an acting agent names, in name order, and the line not recorded last. */
  lines: PeopleLine[]
  /** Each acting agent once in the project; an agent standing on several lines counts once on each such line. */
  running: RunningCounts
  /** Over every package that names a line, each counted once, however many lines it names. */
  total: PackageCounts
}

/** A line is at rest when it has packages and no agent acts on it. */
export function theLineIsAtRest(line: Pick<PeopleLine, 'counts' | 'supervisors' | 'workersUnderNoSupervisor'>): boolean {
  return line.counts.all > 0 && line.supervisors.length === 0 && line.workersUnderNoSupervisor.length === 0
}
