// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PIECE OF WHAT AN AGENT READ IN A FOLDER, AND WHAT A PERSON MAY DO WITH IT.
 *
 * Criterion I3. Declared here, in shared, because the server validates against this shape and the
 * browser draws from it, and the two must not have their own ideas about what a piece is.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY PIECE SAYS WHERE IT CAME FROM, AND THAT IS THE POINT OF THE WHOLE THING
 * ---------------------------------------------------------------------------------------
 *
 * `from` names the files it was read out of and `quote` carries the words in one of them that it
 * rests on. Both are required — not because a schema likes required fields, but because a proposed
 * record with neither is an agent's impression of a folder, and a person cannot check an impression
 * against anything. The rule the skill gives an agent is *only what a file says; unknown stays
 * unknown*, and these two fields are how that rule is enforced rather than requested.
 */

/** Where one piece has got to. Three words, and only a person moves a piece off the first. */
export const PIECE_STATES = ['proposed', 'accepted', 'rejected'] as const
export type PieceState = (typeof PIECE_STATES)[number]

/** One thing an agent would file, if a person agrees. */
export interface FolderReadingPiece {
  /** nanoid, made by the server when the draft is filed. */
  id: string
  /** Which kind of record this would become. */
  kind: string
  title: string
  /** One line beside the title, or null because the agent had nothing to say that a file said. */
  summary: string | null
  /** The kind's own fields, as they would be written. Checked against the kind before it is filed. */
  data: Record<string, unknown>
  /** The files this was read out of, relative to the folder. At least one. */
  from: string[]
  /** The words in one of those files that this rests on, quoted rather than summarised. */
  quote: string
  state: PieceState
  /** The record this became, once a person accepted it. Null until then. */
  recordId: string | null
  /** When a person decided about it, and who. Null until they have. */
  decidedAt: string | null
  decidedBy: string | null
  rejectionUndo?: { token: string; atMs: number; fingerprint: string }
  lastRejectionUndo?: { at: string; by: string }
}

export type FolderPieceDecision =
  | { press: 'accept' | 'reject'; title?: string; summary?: string | null; data?: Record<string, unknown> }
  | { press: 'undo-reject'; token: string }

export interface FolderPieceReply {
  piece: FolderReadingPiece
  where: Record<PieceState, number>
  finished: boolean
  undo?: { token: string; remainingMs: number }
}

export interface FolderReading {
  id: string
  workspaceId: string
  folder: string
  readBy: string
  note: string | null
  pieces: FolderReadingPiece[]
  where: Record<PieceState, number>
  finished: boolean
  createdAt: string
  updatedAt: string
}

/** What the agent could not tell from the folder, said out loud rather than guessed at. */
export interface CouldNotTell {
  /** What was not knowable, in the words a person would use. */
  what: string
  /** Why the folder does not say. */
  because: string
}

/** How many pieces one draft may hold, so a runaway reading is refused rather than stored. */
export const MOST_PIECES_IN_A_READING = 200

/** How long a quoted piece of a file may be. Long enough to check, short enough to read. */
export const LONGEST_QUOTE = 2000

/** Whether every piece of a draft has been decided. */
export function everyPieceDecided(pieces: readonly FolderReadingPiece[]): boolean {
  return pieces.length > 0 && pieces.every((piece) => piece.state !== 'proposed')
}

/** How many pieces are in each state, for a page that says where a reading has got to. */
export function whereItHasGot(pieces: readonly FolderReadingPiece[]): Record<PieceState, number> {
  const out: Record<PieceState, number> = { proposed: 0, accepted: 0, rejected: 0 }
  for (const piece of pieces) out[piece.state] += 1
  return out
}
