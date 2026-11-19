// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHOM A FLOW IS FOR, IN FIELDS THE OFFICE CAN FILTER ON. Wave 13p round 40, proposal Ink4403JeASI part 5, gap 2: role
 * and department were words only, so step 7 of pipeline yjWHzsyUEZw- could not hand a role its flows.
 *
 * A flow's `applies_to` holds:
 *   - `scope`: general, for every project; or special, for one project only;
 *   - `roles`: the role cards whose holders follow it, by the card's name in src/config/roles.json;
 *   - `rung`: optional; every role on the power tree at this rung or above follows it as well;
 *   - `project`: the project a special flow is for. A general flow names none.
 *
 * A DEPARTMENT IS NOT A FIELD. The office has no record of a department to name, so a department in words would be the
 * gap again. A department that is a project is named by its project.
 *
 * The server checks it on every write with `whyTheAppliesToIsUnreadable`; the list's `?role=` reads it with `reaches`.
 */

export const FLOW_SCOPES = ['general', 'special'] as const
export type FlowScope = (typeof FLOW_SCOPES)[number]

export interface FlowAppliesTo {
  scope: FlowScope
  roles: string[]
  rung?: number
  project?: string
}

/** The keys `applies_to` holds. Any other is refused, so a misspelt one is not read as left out. */
const KEYS = ['scope', 'roles', 'rung', 'project']

/** What the check is told about the office: the role cards by name, each with its rung, and whether a project is there. */
export interface WhatTheOfficeHolds {
  roles: readonly { name: string; rung: number | null }[]
  projectIsThere: (id: string) => boolean
}

/**
 * THE SENTENCE A WRITE OF `applies_to` IS REFUSED WITH, or null when the office can store it. `undefined` is a flow
 * nobody has classified yet, which is a real state and not refused.
 */
export function whyTheAppliesToIsUnreadable(value: unknown, office: WhatTheOfficeHolds): string | null {
  if (value === undefined) return null
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'applies_to must be an object: {scope, roles, rung?, project?}.'
  const held = value as Record<string, unknown>
  const strange = Object.keys(held).filter((key) => !KEYS.includes(key))
  if (strange.length > 0) return `applies_to holds only ${KEYS.join(', ')}; it does not hold ${strange.join(', ')}.`
  const scope = held['scope']
  if (typeof scope !== 'string' || !(FLOW_SCOPES as readonly string[]).includes(scope)) return `applies_to.scope is one of ${FLOW_SCOPES.join(' or ')}.`
  const names = office.roles.map((role) => role.name)
  const roles = held['roles']
  if (!Array.isArray(roles) || roles.length === 0) return `applies_to.roles names at least one role card: ${names.join(', ')}.`
  const unknown = roles.filter((role) => typeof role !== 'string' || !names.includes(role))
  if (unknown.length > 0) return `applies_to.roles names role cards only (${names.join(', ')}); ${unknown.map(String).join(', ')} is not one.`
  if (new Set(roles).size !== roles.length) return 'applies_to.roles names each role once.'
  const rungs = office.roles.flatMap((role) => (role.rung === null ? [] : [role.rung]))
  const rung = held['rung']
  if (rung !== undefined && (typeof rung !== 'number' || !rungs.includes(rung))) return `applies_to.rung is a rung of the power tree: ${rungs.join(', ')}.`
  const project = held['project']
  if (scope === 'general' && project !== undefined) return 'A general flow is for every project, so applies_to names no project.'
  if (scope === 'special' && project === undefined) return 'A special flow is for one project, so applies_to.project names it.'
  if (project !== undefined && (typeof project !== 'string' || !office.projectIsThere(project))) return `applies_to.project names a project the office has; "${String(project)}" is not one.`
  return null
}

/** Whether a flow that applies to these reaches the holder of `role`, by its name or by the rung it stands on. */
export function reaches(appliesTo: FlowAppliesTo, role: { name: string; rung: number | null }): boolean {
  if (appliesTo.roles.includes(role.name)) return true
  return appliesTo.rung !== undefined && role.rung !== null && role.rung >= appliesTo.rung
}
