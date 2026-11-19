// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARY DUTIES RECORD'S KIND, AND THE SECRETARY A RECORD NAMES.
 * `SECRETARY_DUTIES_KIND` and `theSecretaryNamedIn` were moved byte for byte out of
 * src/server/lib/grant/secretary-duties.ts, with no change of behaviour, with the `isObject` it reads. That
 * file re-exports the two names and imports `isObject` back, so `isObject` gained the export word.
 */

import type { ParticipantRef } from '@shared/participants.ts'

/** The kind, as RECORD_KINDS spells it. */
export const SECRETARY_DUTIES_KIND = 'secretary_duties'

export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** The secretary a record's data names, when it names one as a registry reference. */
export function theSecretaryNamedIn(data: unknown): ParticipantRef | null {
  const named = isObject(data) ? data['secretary'] : undefined
  if (!isObject(named)) return null
  const { kind, id } = named
  return (kind === 'agent' || kind === 'person') && typeof id === 'string' && id.trim() !== '' ? { kind, id } : null
}
