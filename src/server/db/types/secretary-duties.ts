// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/grant/secretary-duties.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

import type { ParticipantRef } from '@shared/participants.ts'

/** One secretary's duties, as they are stored and as the binding writes them. */
export interface TheDuties {
  area: string
  responsibleFor?: string[]
  lines?: string[]
  doors?: string[]
  reportsToThePerson?: string[]
  restsOn: string[]
  /** The supervisors it answers for, each with the area the chat draws under that supervisor's name. */
  supervisors?: { agent: ParticipantRef; area: string }[]
}

/** Another secretary's duties, as the brief shows them: who, and the area line. */
export interface AnotherSecretarysArea {
  recordId: string
  secretary: string
  /** The agent's handle, or null because no agent has the registry id the record names. */
  handle: string | null
  area: string
}

/** The part of GET /api/brief that says what each secretary does. */
export interface TheDutiesPart {
  /** The reader's own duties in full, or null because no record names the reader. */
  yours: (TheDuties & { recordId: string; secretary: string }) | null
  others: AnotherSecretarysArea[]
  note: string
}
