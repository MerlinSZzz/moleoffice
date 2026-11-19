// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { isDeepStrictEqual } from 'node:util'
import { and, desc, eq } from 'drizzle-orm'
import { sayInEnglish } from '@shared/i18n.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { db } from '../db/client.ts'
import { changes } from '../db/schema.ts'
import { PanelError } from './panel-error.ts'
import type { Actor } from './records.ts'
import { anAgentItsOwnKeyProves } from './who-may-act.ts'
import { theKeyProvesASecretary } from './the-key-proves-a-secretary.ts'
import type { PanelRecord } from '@shared/types.ts'

export const ONLY_THE_SECRETARY_UPDATES_REQUIREMENTS = 'Only a secretary or the person may update a module’s requirements. Nothing was changed.'
export const ONLY_THE_MODULE_SUPERVISOR_WRITES_THE_PLAN = 'A module’s plan belongs to its supervisor. Only that supervisor or the person may change it; a secretary may not. Nothing was changed.'
export const ONLY_THE_OWNER_NAMES_THE_OWNER = 'Only the person or the current module owner may change the owner. When no owner is named, ask the person to name one. Nothing was changed.'
export const USE_THE_REQUIREMENTS_DOOR = 'Update the module’s requirements through its requirements door. Nothing was changed.'

/** The ledger field of an explicit requirements update, which the package door reads back. */
export const REQUIREMENTS_UPDATE_FIELD = 'data.requirementsUpdate'
let requirementsDoorIsWriting = false

/** A module's newest requirements update in the ledger, or undefined when it has none. */
export function theLastRequirementsUpdate(moduleId: string) {
  return db.select().from(changes).where(and(eq(changes.recordId, moduleId), eq(changes.field, REQUIREMENTS_UPDATE_FIELD))).orderBy(desc(changes.appendOrder)).get()
}

type Image = { kind: string; data: unknown }
function bag(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function part(data: unknown, id: string): unknown[] {
  const parts = bag(data)['parts']
  return Array.isArray(parts) ? parts.filter(one => bag(one)['id'] === id) : []
}
function planWriter(data: unknown, actor: Actor): boolean {
  if (thePersonIsProved(actor)) return true
  if (theKeyProvesASecretary(actor)) return false
  const owner = bag(bag(data)['owner'])
  return owner['kind'] === 'agent' && typeof owner['id'] === 'string' && owner['id'] === anAgentItsOwnKeyProves(actor)
}

/** Ask the same question of creation, a whole-record patch, and a checklist item write. */
export function refuseModulePartChanges(before: Image, after: Image, actor: Actor): void {
  if (before.kind !== 'module' && after.kind !== 'module') return
  const oldData = before.kind === 'module' ? before.data : {}
  const newData = after.kind === 'module' ? after.data : {}
  if (!isDeepStrictEqual(part(oldData, 'plan'), part(newData, 'plan')) && !planWriter(before.kind === 'module' ? oldData : newData, actor)) {
    throw new PanelError(ONLY_THE_MODULE_SUPERVISOR_WRITES_THE_PLAN, 403)
  }
  const oldOwner = bag(oldData)['owner'] ?? null
  const newOwner = bag(newData)['owner'] ?? null
  if (!isDeepStrictEqual(oldOwner, newOwner) && !thePersonIsProved(actor)) {
    const current = bag(oldOwner)
    if (current['kind'] !== 'agent' || typeof current['id'] !== 'string' || current['id'] !== anAgentItsOwnKeyProves(actor)) {
      throw new PanelError(ONLY_THE_OWNER_NAMES_THE_OWNER, 403)
    }
  }
  if (!requirementsDoorIsWriting && !isDeepStrictEqual(part(oldData, 'requirements'), part(newData, 'requirements'))) {
    throw new PanelError(USE_THE_REQUIREMENTS_DOOR, 403)
  }
}

/** The requirements door's own write: the one write that may change the requirements part. */
export function whileTheRequirementsDoorWrites<T>(write: () => T): T {
  requirementsDoorIsWriting = true
  try {
    return write()
  } finally {
    requirementsDoorIsWriting = false
  }
}

/**
 * Who may update a module's requirements, and the parts the update writes. The write itself is in
 * updating-module-requirements.ts, which imports records.ts; this file imports no value from it.
 */
export function theRequirementsUpdate(record: PanelRecord, items: Record<string, unknown>[], actor: Actor) {
  if (record.kind !== 'module') throw new PanelError('Only a module has requirements. Nothing was changed.', 400)
  if (!thePersonIsProved(actor) && !theKeyProvesASecretary(actor)) throw new PanelError(ONLY_THE_SECRETARY_UPDATES_REQUIREMENTS, 403)
  const data = bag(record.data)
  const oldParts = Array.isArray(data['parts']) ? data['parts'] : []
  const existing = part(data, 'requirements')
  if (existing.length > 1) throw new PanelError('This module has more than one requirements part. Make the parts unique first. Nothing was changed.', 400)
  const current = bag(existing[0])
  const next = { ...current, id: 'requirements', name: typeof current['name'] === 'string' ? current['name'] : sayInEnglish('module.requirementsPart'), items }
  const nextParts = existing.length === 0 ? [...oldParts, next] : oldParts.map(one => bag(one)['id'] === 'requirements' ? next : one)
  return { before: existing[0] ?? null, after: next, parts: nextParts }
}

export const A_PACKAGE_NEEDS_A_MODULE = 'Name at least one module in moduleIds when calling POST /api/delegation/<task>/package. Nothing was written.'
export const UPDATE_MODULE_REQUIREMENTS_FIRST = 'Update this module’s requirements first through its requirements door. Nothing was written.'
