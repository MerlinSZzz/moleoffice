// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CASTING LABEL, AND THE OFFICE'S HINTS ABOUT A PACKAGE'S PLAN. Round FQ, points OP-1 and OP-2.
 *
 * ONE FUNCTION READS A DIFFICULTY WORD AS A LABEL from the Casting table. Nothing else in OP's
 * code keeps a list of difficulty words: the plan page shows a plan's difficulty as the supervisor wrote it, and the
 * worker start asks this one reader whether the difficulty it was given is a label.
 *
 * THE STRONG-MODEL HINT READS THE CASTING ROWS THE DRAW READS. For the package's project and the worker card it takes
 * the rows in force through `theRowsInForce`, the same call the default draw makes, and compares the plan's model with
 * the model its rows give for the piece's label. A model matches a row when it is the row's model cell, or the part of
 * that cell after its last `/`, with upper and lower case taken as the same. No word or model is named here.
 */
import { readCastingLabelIds } from '@shared/casting.ts'
import { readACastingLabelWord as readLabel, theCastingLabelNames } from './casting-labels.ts'
import type { PackagePlanShape, PlanHint } from '@shared/delegation.ts'
import { THE_WORKER } from '@shared/roles.ts'
import { theRowsInForce } from './the-rows-in-force.ts'

/** What one difficulty word is: a label the office knows, or the labels it knows now. */
export type ACastingLabel =
  | { is: 'a label'; name: string }
  | { is: 'no label'; labels: readonly string[] }

/** Read the current labels; a former name is not a current label. */
export function readACastingLabelWord(word: string): ACastingLabel {
  const result = readLabel(word)
  return result.is === 'renamed' ? { is: 'no label', labels: [...theCastingLabelNames().values()] } : result
}

/** A path or area with its trailing slashes gone, so `src/a/` and `src/a` are one place. */
function thePlaceItNames(file: string): string {
  return file.trim().replace(/\/+$/, '')
}

/** True when two named files or areas are the same place, or one is a folder holding the other. */
function theSamePlace(a: string, b: string): boolean {
  const left = thePlaceItNames(a)
  const right = thePlaceItNames(b)
  if (left === '' || right === '') return false
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

/** The model cells the rows give for one label, as the rows write them, each once. */
function theModelsTheRowsGive(project: string, label: string): string[] {
  const names = theCastingLabelNames()
  const rows = theRowsInForce(THE_WORKER, project).filter((row) =>
    readCastingLabelIds(row.cells.labels.value, `Casting row ${String(row.id)}`).some((id) => names.get(id) === label),
  )
  const models = rows.flatMap((row) => (row.cells.model.value === null ? [] : [row.cells.model.value]))
  return [...new Set(models)]
}

/** Whether a plan's model is one the rows give: the cell itself, or the part after its last `/`, case-insensitive. */
function theModelIsOneTheRowsGive(model: string, models: readonly string[]): boolean {
  const wanted = model.trim().toLowerCase()
  return models.some((given) => {
    const written = given.trim().toLowerCase()
    return written === wanted || written.slice(written.lastIndexOf('/') + 1) === wanted
  })
}

/**
 * WHAT THE OFFICE POINTS OUT ABOUT A PLAN, worked out once by the align door and stored on the alignment. Every hint
 * is words for the reader and nothing here refuses anything.
 */
export function thePlansHints(plan: PackagePlanShape, pointIds: readonly string[], project: string): PlanHint[] {
  const hints: PlanHint[] = []
  for (let i = 0; i < plan.workers.length; i += 1) {
    for (let j = i + 1; j < plan.workers.length; j += 1) {
      const left = plan.workers[i]!
      const right = plan.workers[j]!
      const shared = left.files.filter((file) => right.files.some((other) => theSamePlace(file, other)))
      if (shared.length > 0) {
        hints.push({
          code: 'sameFiles',
          values: { workerA: left.worker, workerB: right.worker, files: [...new Set(shared)].join(', ') },
        })
      }
    }
  }
  if (plan.workers.length > pointIds.length) {
    hints.push({ code: 'moreWorkersThanPoints', values: { workers: plan.workers.length, points: pointIds.length } })
  }
  const labelled = plan.workers.map((worker) => ({ worker, label: readACastingLabelWord(worker.difficulty) }))
  for (const { worker, label } of labelled) {
    if (worker.difficulty === '' || label.is === 'no label' || worker.modelWhy !== '') continue
    const models = theModelsTheRowsGive(project, label.name)
    if (models.length === 0) {
      hints.push({ code: 'strongModelNoModel', values: { worker: worker.worker, difficulty: label.name, model: worker.model } })
      continue
    }
    if (!theModelIsOneTheRowsGive(worker.model, models)) {
      hints.push({
        code: 'strongModelNoReason',
        values: { worker: worker.worker, difficulty: label.name, model: worker.model, models: models.join(', ') },
      })
    }
  }
  for (const { worker, label } of labelled) {
    if (label.is === 'no label') {
      hints.push({
        code: 'difficultyNotALabel',
        values: { worker: worker.worker, difficulty: worker.difficulty, labels: label.labels.join(' or ') },
      })
    }
  }
  for (const worker of plan.workers) {
    const missing = [
      worker.difficulty === '' ? 'a difficulty' : '',
      worker.difficultyWhy === '' ? 'a reason for its difficulty' : '',
      worker.modelWhy === '' ? 'a reason for its model' : '',
    ].filter((one) => one !== '')
    if (missing.length > 0) {
      hints.push({ code: 'missingDifficultyOrReason', values: { worker: worker.worker, missing: missing.join(' and ') } })
    }
  }
  if (plan.waves > 1) hints.push({ code: 'moreThanOneWave', values: { waves: plan.waves } })
  for (let wave = 2; wave <= plan.waves; wave += 1) {
    if ((plan.waits[wave - 2] ?? '').trim() === '') hints.push({ code: 'waveWaitsForNothing', values: { wave } })
  }
  return hints
}
