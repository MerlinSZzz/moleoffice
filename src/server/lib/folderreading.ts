// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FILING WHAT AN AGENT READ IN A FOLDER, AS ONE ROW.
 *
 * The writer lives here rather than in the route because two callers need it: the route, and the
 * restore proof in `scripts/restore-check.ts`, which has to put a real row in this table to prove a
 * draft survives a backup. A proof that typed the row straight into SQL would be proving a row
 * shape rather than the thing the product writes.
 */
import { nanoid } from 'nanoid'
import { anOfficeId } from './ids.ts'
import { createHash } from 'node:crypto'

import { db } from '../db/client.ts'
import { folderReadings } from '../db/schema.ts'
import { validateRecordData } from './validate.ts'
import { PanelError } from './panel-error.ts'
import { nowStamp } from '@shared/time.ts'
import { RECORD_KINDS, type RecordKind } from '@shared/types.ts'
import type { CouldNotTell, FolderReadingPiece } from '@shared/folderreading.ts'
import type { ParticipantKind } from '@shared/participants.ts'
import { FOLDER_REJECTION_UNDO_MS } from '@shared/danger-tiers.ts'

function pieceFingerprint(piece: FolderReadingPiece): string {
  const { rejectionUndo: _offer, ...value } = piece
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

// Keep each offer tied to this rejection, including its content and decision stamp.
export function offerRejectionUndo(piece: FolderReadingPiece): NonNullable<FolderReadingPiece['rejectionUndo']> {
  return { token: nanoid(), atMs: Date.now(), fingerprint: pieceFingerprint(piece) }
}

export function undoPieceRejection(piece: FolderReadingPiece, token: string, actorId: string): FolderReadingPiece {
  const offer = piece.rejectionUndo
  if (piece.state !== 'rejected' || offer === undefined || offer.token !== token) {
    throw new PanelError('This undo no longer names the current rejection. Nothing was changed.', 409)
  }
  const age = Date.now() - offer.atMs
  if (!Number.isFinite(age) || age < 0 || age >= FOLDER_REJECTION_UNDO_MS) {
    throw new PanelError('The time to undo this rejection has passed. Nothing was changed.', 409)
  }
  if (pieceFingerprint(piece) !== offer.fingerprint) {
    throw new PanelError('This piece changed after it was rejected. Nothing was changed.', 409)
  }
  const restored = { ...piece, state: 'proposed' as const, decidedAt: null, decidedBy: null,
    lastRejectionUndo: { at: nowStamp(), by: actorId } }
  delete restored.rejectionUndo
  return restored
}

/** One piece as a caller hands it in, before the server gives it an id and a state. */
export interface PieceAsRead {
  kind: string
  title: string
  summary?: string | null
  data?: Record<string, unknown>
  from: string[]
  quote: string
}

/** Whether a word is one of the kinds this product has. */
export function isAKind(word: string): word is RecordKind {
  return (RECORD_KINDS as readonly string[]).includes(word)
}

/**
 * Store one reading of a folder. Nothing becomes a record.
 *
 * EVERY PIECE IS VALIDATED AGAINST ITS KIND FIRST, all of it, before anything is stored — so an
 * agent hears about a bad field while it still has the folder open, rather than the person hearing
 * about it one press at a time. A draft half of which could never become a record is worse than a
 * refusal.
 */
export function fileAFolderReading(input: {
  workspaceId: string
  actorId: string
  /** Whose id `actorId` is, stored beside it as `read_by_kind` and `owner_kind`. */
  actorKind: ParticipantKind
  folder: string
  note?: string
  couldNotTell?: CouldNotTell[]
  pieces: PieceAsRead[]
}): typeof folderReadings.$inferSelect {
  const wrong: string[] = []
  for (const [index, piece] of input.pieces.entries()) {
    if (!isAKind(piece.kind)) {
      wrong.push(`piece ${String(index + 1)} ("${piece.title}"): "${piece.kind}" is not a kind Mole Office has.`)
      continue
    }
    try {
      validateRecordData(piece.kind, piece.data ?? {})
    } catch (err) {
      wrong.push(`piece ${String(index + 1)} ("${piece.title}"): ${(err as Error).message}`)
    }
  }
  if (wrong.length > 0) {
    throw new PanelError(
      `This reading was not stored, because ${String(wrong.length)} of its ${String(input.pieces.length)} pieces ` +
        `could never become a record:\n  - ${wrong.join('\n  - ')}\nNothing was written. GET /api/kinds/<kind> ` +
        'names every field a kind takes.',
    )
  }

  const now = nowStamp()
  const pieces: FolderReadingPiece[] = input.pieces.map((piece) => ({
    id: anOfficeId(),
    kind: piece.kind,
    title: piece.title,
    summary: piece.summary ?? null,
    data: piece.data ?? {},
    from: piece.from,
    quote: piece.quote,
    state: 'proposed',
    recordId: null,
    decidedAt: null,
    decidedBy: null,
  }))
  const row = {
    id: anOfficeId(),
    workspaceId: input.workspaceId,
    ownerId: input.actorId,
    ownerKind: input.actorKind,
    folder: input.folder,
    readBy: input.actorId,
    readByKind: input.actorKind,
    note:
      input.couldNotTell === undefined || input.couldNotTell.length === 0
        ? (input.note ?? null)
        : `${input.note ?? ''}\n\nWhat this folder does not say:\n${input.couldNotTell
            .map((one) => `  - ${one.what} — ${one.because}`)
            .join('\n')}`.trim(),
    pieces,
    createdAt: now,
    updatedAt: now,
  }
  db.insert(folderReadings).values(row).run()
  return row as typeof folderReadings.$inferSelect
}
