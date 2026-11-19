// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH PIPELINE IS A PROJECT'S MASTER: THE ONE READER, AND THE ONE WRITER.
 *
 * The master pipeline is the pipeline whose steps are the project's architecture blocks. The project board reads its
 * rows from it. It is stored in `workspaces.master_pipeline` (migration 0338), one record id per project.
 *
 * ---------------------------------------------------------------------------------------
 * A READING SAYS WHICH OF THREE THINGS IS TRUE, AND NEVER GUESSES
 * ---------------------------------------------------------------------------------------
 *
 *   marked     the column names a live pipeline of this project: `id` and `title`.
 *   unmarked   the column is NULL: nobody has marked one.
 *   broken     the column names a record that is deleted, is not a pipeline, is in another project, or is not
 *              there at all: `id` and `because`.
 *
 * NO PIPELINE IS CHOSEN IN PLACE OF A BROKEN OR MISSING MARK. A project with one pipeline titled "master" is still
 * unmarked, because the board would otherwise draw a guess as if somebody had chosen it.
 *
 * NOTHING IS CACHED. Every reading reads the column and the record again, so a change reaches the next board read.
 *
 * WHO MAY CHANGE IT is decided by the door in api/project-board.ts before this writer is called: a secretary
 * proved by its own key, with a reason, or the owner.
 */

// THE SHAPES ARE THE BOARD'S, so the board's reply and this reading are one type.
import type { TheMasterPipeline, WhyTheMarkIsBroken } from '@shared/project-board.ts'

import { sqlite } from '../db/client.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. Only built when the writer refuses, never at import.
import { PanelError } from './panel-error.ts'
import { getRecord } from './records/reading.ts'
import { getWorkspace } from '../db/get-workspace.ts'

export type { TheMasterPipeline, WhyTheMarkIsBroken }

/** Why this record cannot be a project's master pipeline, or null when it can. */
function whyItCannotBeTheMaster(project: string, id: string): WhyTheMarkIsBroken | null {
  const record = getRecord(id)
  if (record === null) return 'not there'
  if (record.deletedAt !== null) return 'deleted'
  if (record.kind !== 'pipeline') return 'not a pipeline'
  if (record.workspaceId !== project) return 'in another project'
  return null
}

/** The project's row, or a coded 404 naming the project that is not there. */
function theProject(project: string): void {
  if (getWorkspace(project) === null) {
    throw new PanelError(`There is no project "${project}" here. GET /api/workspaces lists them. Nothing was changed.`, 404, undefined, undefined, undefined, {
      code: 'masterPipelineNoSuchProject',
      values: {},
    })
  }
}

/** WHAT IS STORED FOR ONE PROJECT, checked against the record it names. */
export function theMasterPipeline(project: string): TheMasterPipeline {
  theProject(project)
  const row = sqlite.prepare('SELECT master_pipeline AS id FROM workspaces WHERE id = ?').get(project) as { id: string | null }
  if (row.id === null) return { project, state: 'unmarked' }
  const because = whyItCannotBeTheMaster(project, row.id)
  if (because !== null) return { project, state: 'broken', id: row.id, because }
  return { project, state: 'marked', id: row.id, title: getRecord(row.id)?.title ?? '' }
}

/**
 * MARK ONE PROJECT'S MASTER PIPELINE, OR MARK NONE, AND ANSWER WITH THE READING.
 *
 * `id` is a record id, or null to mark none. A record that is not a live pipeline of this project is refused before
 * anything is written, with the reason. The caller has already checked who is asking and whether a reason is needed,
 * and it writes the change down.
 */
export function markTheMasterPipeline(project: string, id: string | null): TheMasterPipeline {
  theProject(project)
  if (id !== null) {
    const because = whyItCannotBeTheMaster(project, id)
    const tail = ' Only a live pipeline of this project can be its master pipeline. Nothing was changed.'
    if (because === 'not there' || because === 'deleted') {
      throw new PanelError(`No live record has the id "${id}".${tail}`, 400, undefined, undefined, undefined, {
        code: 'masterPipelineNoSuchRecord',
        values: {},
      })
    }
    if (because === 'not a pipeline') {
      throw new PanelError(`The record "${id}" is not a pipeline.${tail}`, 400, undefined, undefined, undefined, {
        code: 'masterPipelineNotAPipeline',
        values: {},
      })
    }
    if (because === 'in another project') {
      throw new PanelError(`The pipeline "${id}" is in another project.${tail}`, 400, undefined, undefined, undefined, {
        code: 'masterPipelineInAnotherProject',
        values: {},
      })
    }
  }
  sqlite.prepare('UPDATE workspaces SET master_pipeline = ? WHERE id = ?').run(id, project)
  return theMasterPipeline(project)
}
