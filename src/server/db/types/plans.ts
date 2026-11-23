// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/plans.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

import type { PlanningKey } from '@shared/planline.ts'
import type { planLines } from '../schema.ts'

/** One line of a plan, exactly as stored. */
export interface PlanLine {
  id: string
  planId: string
  position: number
  /** The words as typed. An empty string is a real line: a blank line is part of the writing. */
  text: string
  /** The record this line was filed as, or null because nobody has filed it. */
  recordId: string | null
  /**
   * The writer's own note about this line, READ OUT OF `text`, or null because the line holds none.
   *
   * IT IS NOT STORED HERE AND NOT STORED IN A COLUMN. The note is a `{note: …}` group in the line's
   * own words, so editing the words keeps it — which is exactly what it did not do while it was a
   * column: saving an edited document matched rows by their exact text and re-inserted the changed
   * ones with no remark, and nothing said a note had gone.
   *
   * Null when the line holds no note AND when it holds more than one, because Mole Office will not pick
   * one of two things somebody wrote. Nothing is hidden either way: the words are in `text`.
   */
  remark: string | null
  /**
   * Every planning value written on this line, as typed, in order.
   *
   * PLANNING INTENT AND NOTHING ELSE. Nothing here has entered any total, any capacity or any
   * record; `fileLineAsWork` is the one thing that moves a value out of the line.
   */
  planning: { key: PlanningKey; value: string }[]
  updatedAt: string
  updatedBy: string
}

export type LineRow = typeof planLines.$inferSelect
