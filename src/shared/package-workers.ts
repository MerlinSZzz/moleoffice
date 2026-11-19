// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PACKAGE'S WORKERS COST AND RETURNED. Round FQ, point OP-3.
 *
 * A worker start names the package it works on, the package's points, the difficulty and why. The office keeps that on
 * the supervisor's ask (`package`) and copies it onto the worker's own run (`workerPackage`), so a package's page can
 * list every worker that was given it without reading a second store. This file is the shape of those rows, shared by
 * the server that works them out and the page that draws them.
 *
 * NOTHING HERE IS STORED except `TheWorkerPackage` in src/shared/worker-runs.ts: the tokens, minutes and hand-back
 * counts are readings of the run's own record and the task's own `package` field, worked out fresh on every read.
 *
 * A MISSING RECEIPT IS NEVER ZERO. `tokens.read` is false and `tokens.notRead` says why; `total` is null. A count of
 * zero is a measured value and reads as one.
 */

import type { TheWorkerPackage } from './worker-runs.ts'

/** What one worker's run used, read only from its own usage receipt. */
export interface TheTokensAWorkerUsed {
  /** Input tokens, including cache reads by the receipt's own rule, or null because nobody measured one. */
  input: number | null
  output: number | null
  /** Input and output together, or null when either is not measured. */
  total: number | null
  /** Whether the run's record carried a usage receipt at all. False is not zero tokens. */
  read: boolean
  /** Why no number is here, or null because every number is. */
  notRead: string | null
}

/** How long one worker's run took, by the office's own times of its start and end. */
export interface TheMinutesAWorkerRan {
  /** The office's start: the run's `startedAt`, or when the office filed the run when it names none. */
  startedAt: string | null
  /** The run's `closedAt`, or null because it has not ended or names none. */
  endedAt: string | null
  /** Whole minutes between the two, or null. Never a partial guess. */
  minutes: number | null
  /** Whether the run had not ended when this account was read. */
  running: boolean
  /** Why no number is here, or null because there is one. */
  notCounted: string | null
}

/** One worker a package was given to, as the package's page lists it. */
export interface AWorkerOfAPackage {
  /** The worker's registry id, or null when the stored ask or run names none. */
  agent: string | null
  /** The registry's name for the worker, or null when it holds none. */
  name: string | null
  handle: string
  /** The ask's own state. */
  asked: 'wanted' | 'starting' | 'started' | 'failed'
  /** The worker's run's own state, or null because no run was filed or it is not in this project. */
  state: string | null
  askedAt: string
  /** The supervisor's run the ask was kept on. */
  askedOn: { run: string; title: string | null } | null
  /** The worker's run the launcher filed, or null before one was. */
  runId: string | null
  runTitle: string | null
  model: string | null
  /** The points the ask named, as stored. */
  points: string[]
  /** The difficulty the ask named, as stored, or null because no ask named one. */
  difficulty: string | null
  why: string | null
  tokens: TheTokensAWorkerUsed
  minutes: TheMinutesAWorkerRan
  /** How many of the package's hand-backs name this worker's run. */
  wentBack: number
  wentBackSays: string
}

/** Every worker one package was given to, and the hand-backs that name no worker of it. */
export interface TheWorkersOfAPackage {
  task: string
  title: string
  /** The package's own points, as the task holds them now. */
  pointIds: string[]
  workers: AWorkerOfAPackage[]
  handbacks: { total: number; byWorkers: number; notNamingAWorker: number }
  /** One sentence saying what was read and what a missing number means. */
  says: string
}

/** One package's row in a day's read, with the ask that put it on that day. */
export interface APackageAskedOnADay {
  /** The first ask on that day, local wall clock, and the order the pages follow, newest first. */
  askedAt: string
  package: TheWorkersOfAPackage
}

/** One package asked for work on a day that the office cannot put on a page, with why. */
export interface APackageLeftOutOfADay {
  /** The task id an ask named. It may name a deleted record, a record of another kind, or a task with no package. */
  task: string
  /** Why this package is not on the page, in one sentence a person reads. */
  because: string
}

/** A day's packages, in pages of at most 25, each with the same list its own door gives. */
export interface TheWorkersOfADay {
  day: string
  packages: APackageAskedOnADay[]
  page: { number: number; size: number; total: number; pages: number; hasMore: boolean }
  /**
   * The packages asked for work on the day that the office cannot read, counted out of `page.total` and named with why.
   * `count` and `packages.length` are the same number.
   */
  leftOut: { count: number; packages: APackageLeftOutOfADay[]; says: string }
  says: string
}
