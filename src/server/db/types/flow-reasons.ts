// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/flow-reasons.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

/**
 * ONE RECORD A DECISION WAS BASED ON, as a reader is shown it. Its title is given only when the record is in the
 * decision's own project: a record elsewhere, a message in the message centre among them, is named by id and kind, so
 * a reply never carries the words of a record its reader may not be allowed to read.
 */
export interface BasisEntry {
  id: string
  kind: string | null
  title: string | null
  /** Why there is no title: the record is in another project, or it is not there (deleted since, or never was). */
  untitledBecause: 'another-project' | 'not-there' | null
}
