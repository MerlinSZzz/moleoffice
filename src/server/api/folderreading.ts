// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STRANGER'S FOLDER BECOMES A DRAFT, AND NOTHING ELSE, UNTIL A PERSON PRESSES.
 *
 * Criterion I3: somebody with a lot of data and scripts, using Mole Office for the first time: how
 * does an agent organise it into project state quickly?
 *
 * ---------------------------------------------------------------------------------------
 * FOUR ROUTES, AND THE ONE THAT WRITES RECORDS IS THE PERSON'S
 * ---------------------------------------------------------------------------------------
 *
 *   POST /api/import/draft                       an agent files ONE draft of what it read
 *   GET  /api/import/drafts                      what is waiting to be looked at
 *   GET  /api/import/drafts/:id                  one draft, whole
 *   POST /api/import/drafts/:id/pieces/:pieceId  a person accepts, edits or rejects one piece
 *
 * The last one is refused to every agent, in so many words. That is the whole design: an agent may
 * read a hundred files and propose forty things, and not one of them is in the project until a
 * person has pressed something. An agent that filed records directly would be filing work nobody
 * has read, into the count, the attention rule and the searches.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED WHEN THE DRAFT IS FILED, AND WHY IT IS CHECKED THEN
 * ---------------------------------------------------------------------------------------
 *
 * Every piece is validated against its kind the moment the draft arrives, by the same
 * `validateRecordData` a `POST /api/records` goes through. So an agent finds out about a bad field
 * while it still has the folder in front of it, rather than the person finding out at the moment
 * they press accept. An accepted piece is validated again on the way to becoming a record, because
 * a person may have edited it.
 *
 * EVERY PIECE MUST NAME A FILE AND QUOTE IT. That is refused rather than requested: a proposed
 * record with no file behind it is an agent's impression, and the person has nothing to check it
 * against. `src/shared/folderreading.ts` says the same thing where the shape is declared.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { db } from '../db/client.ts'
import { folderReadings } from '../db/schema.ts'
import { createRecord, assertMayAcceptAnImportPiece } from '../lib/records.ts'
import { fileAFolderReading, isAKind, offerRejectionUndo, undoPieceRejection } from '../lib/folderreading.ts'
import { validateRecordData } from '../lib/validate.ts'
import { RECORD_KINDS, theKindOfAnActorsId } from '@shared/types.ts'
import { nowStamp } from '@shared/time.ts'
import { FOLDER_REJECTION_UNDO_MS } from '@shared/danger-tiers.ts'
import {
  everyPieceDecided,
  LONGEST_QUOTE,
  MOST_PIECES_IN_A_READING,
  whereItHasGot,
  type FolderReadingPiece,
  type FolderPieceReply,
} from '@shared/folderreading.ts'

const pieceOnFiling = z.strictObject({
  kind: z.enum(RECORD_KINDS),
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(2000).nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  from: z.array(z.string().min(1).max(500)).min(1).max(50),
  quote: z.string().min(1).max(LONGEST_QUOTE),
})

const draftBody = z.strictObject({
  folder: z.string().min(1).max(1000),
  note: z.string().min(1).max(4000).optional(),
  couldNotTell: z
    .array(z.strictObject({ what: z.string().min(1).max(400), because: z.string().min(1).max(400) }))
    .max(50)
    .optional(),
  pieces: z.array(pieceOnFiling).min(1).max(MOST_PIECES_IN_A_READING),
})

const decideBody = z.union([z.strictObject({
  /** What the person is doing with this piece. `accept` is the only one that writes a record. */
  press: z.enum(['accept', 'reject']),
  /** An edited piece, when the person changed it before accepting. */
  title: z.string().trim().min(1).max(300).optional(),
  summary: z.string().trim().min(1).max(2000).nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}), z.strictObject({ press: z.literal('undo-reject'), token: z.string().min(1) })])

/** One stored draft, in the shape a reader gets it back. */
function asRead(row: typeof folderReadings.$inferSelect): Record<string, unknown> {
  const pieces = row.pieces as FolderReadingPiece[]
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    folder: row.folder,
    readBy: row.readBy,
    note: row.note,
    pieces,
    where: whereItHasGot(pieces),
    finished: everyPieceDecided(pieces),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** The draft with this id, in this project, or a 404 saying which. */
function theDraft(id: string, workspaceId: string): typeof folderReadings.$inferSelect {
  const row = db
    .select()
    .from(folderReadings)
    .where(and(eq(folderReadings.id, id), eq(folderReadings.workspaceId, workspaceId)))
    .get()
  if (row === undefined) {
    // WHICH PROJECT IT IS REALLY IN, when it is in one. A refusal that only said "not here" would
    // leave a caller unable to tell a wrong id from a right id in another project, and those are
    // different mistakes with different fixes.
    const elsewhere = db
      .select({ workspaceId: folderReadings.workspaceId })
      .from(folderReadings)
      .where(eq(folderReadings.id, id))
      .get()
    throw new PanelError(
      elsewhere === undefined
        ? `No folder reading has the id "${id}", in this project or any other. GET /api/import/drafts lists the ` +
          'ones this project has.'
        : `The folder reading "${id}" is in the project "${elsewhere.workspaceId}", and this request named ` +
          `"${workspaceId}". Nothing was read. Send x-mole-office-workspace: ${elsewhere.workspaceId} to work ` +
          'in the project it belongs to.',
      404,
    )
  }
  return row
}

export async function folderReadingRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/import/draft',
    route(
      'import.draft',
      'remote',
      'AN AGENT FILES WHAT IT READ IN A FOLDER, AS ONE DRAFT, AND NOTHING BECOMES A RECORD. Every piece ' +
        'names the files it came from and quotes the words it rests on, and both are refused when absent: a ' +
        'proposed record with nothing behind it is an impression, and a person has nothing to check an ' +
        'impression against. Every piece is validated against its kind now, so an agent hears about a bad ' +
        'field while it still has the folder open. What the folder did not say goes in `couldNotTell` rather ' +
        'than being guessed at. Nothing here enters the project: a person accepts each piece, one at a time, ' +
        'on POST /api/import/drafts/:id/pieces/:pieceId. ' +
        'ONLY WHAT A FILE SAYS. A README claiming the tests pass is a file saying the tests pass, not the tests ' +
        'passing: propose it as a claim whose state says nobody has measured it, quoting the sentence. A file’s ' +
        'existence is a fact about the folder; what the file is FOR is a fact only if something in the folder ' +
        'says so. A date in a document is when somebody wrote that date, not when the work happened, unless the ' +
        'document says otherwise. Do not invent the shape of the work: propose the modules, problems and claims ' +
        'the folder’s own files describe, and do not propose a problem nobody in the folder has recorded as ' +
        'one — that is an agent’s opinion about a folder that is not its own. Ten honest pieces the person can ' +
        'check are worth more than forty they have to take on trust.',
    ),
    async (req, reply) => {
      const body = parse(draftBody, req.body, 'That is not a reading of a folder:')
      const actor = actorFrom(req)
      const row = fileAFolderReading({
        workspaceId: workspaceOf(req),
        actorId: actor.id,
        actorKind: theKindOfAnActorsId(actor.type),
        folder: body.folder,
        ...(body.note === undefined ? {} : { note: body.note }),
        ...(body.couldNotTell === undefined ? {} : { couldNotTell: body.couldNotTell }),
        pieces: body.pieces,
      })
      reply.status(201)
      return {
        draft: asRead(row),
        note:
          'Nothing has entered the project. Every piece is waiting for a person, on the page at ' +
          `#/folder-reading, or on POST /api/import/drafts/${row.id}/pieces/<piece id>, which is refused ` +
          'to every agent.',
      }
    },
  )

  app.get(
    '/import/drafts',
    route(
      'import.drafts',
      'remote',
      'Every folder an agent has read in this project, newest first, with how many of its pieces are still ' +
        'waiting for somebody to look at them.',
    ),
    async (req) => {
      const rows = db
        .select()
        .from(folderReadings)
        .where(eq(folderReadings.workspaceId, workspaceOf(req)))
        .orderBy(desc(folderReadings.createdAt))
        .all()
      return { drafts: rows.map(asRead) }
    },
  )

  app.get<{ Params: { id: string } }>(
    '/import/drafts/:id',
    route('import.drafts', 'remote', 'One folder reading, whole: every piece, the files it came from and the words it rests on.'),
    async (req) => ({ draft: asRead(theDraft(req.params.id, workspaceOf(req))) }),
  )

  app.post<{ Params: { id: string; pieceId: string } }>(
    '/import/drafts/:id/pieces/:pieceId',
    route(
      'import.accept',
      'remote',
      'A PERSON ACCEPTS, EDITS, REJECTS OR UNDOES THE REJECTION OF ONE PIECE OF WHAT AN AGENT READ. Accepting writes the record, ' +
        'marked as authored and carrying the draft it came from as its source. Rejecting writes no record and ' +
        'leaves the piece marked as rejected. Undo restores that same, unchanged piece within the offer. An edit is sent with the ' +
        'accept: what is stored is what the person accepted, not what the agent proposed, and the piece keeps ' +
        'both. REFUSED TO EVERY AGENT, including the one that filed the draft — that refusal is the whole ' +
        'point of a draft existing.',
    ),
    async (req) => {
      const actor = actorFrom(req)
      // THE ONE DOOR, asked here rather than written out inline. `assertMayAcceptAnImportPiece` is
      // registered in GOVERNANCE_GUARDS, so the role gate, the refusal and GET /api/access name this
      // act the way they name every other act of the person's.
      assertMayAcceptAnImportPiece(actor)
      const body = parse(decideBody, req.body, 'That is not a way to decide about a piece:')
      const workspaceId = workspaceOf(req)
      const row = theDraft(req.params.id, workspaceId)
      const pieces = row.pieces as FolderReadingPiece[]
      const piece = pieces.find((one) => one.id === req.params.pieceId)
      if (piece === undefined) {
        throw new PanelError(`This reading has no piece with the id "${req.params.pieceId}".`, 404)
      }
      if (body.press === 'undo-reject') {
        const restored = undoPieceRejection(piece, body.token, actor.id)
        const next = pieces.map((one) => one.id === piece.id ? restored : one)
        db.update(folderReadings).set({ pieces: next, updatedAt: nowStamp() }).where(eq(folderReadings.id, row.id)).run()
        return { piece: restored, where: whereItHasGot(next), finished: everyPieceDecided(next) } satisfies FolderPieceReply
      }
      if (piece.state !== 'proposed') {
        throw new PanelError(
          `That piece was already ${piece.state}${piece.decidedAt === null ? '' : ` on ${piece.decidedAt}`}, and a ` +
            'decision is not taken back by pressing again. Nothing was written.',
          409,
        )
      }

      const now = nowStamp()
      if (body.press === 'reject') {
        piece.state = 'rejected'
        piece.decidedAt = now
        piece.decidedBy = actor.id
        piece.rejectionUndo = offerRejectionUndo(piece)
      } else {
        const title = body.title ?? piece.title
        const summary = body.summary === undefined ? piece.summary : body.summary
        const data = body.data ?? piece.data
        // The kind was one of the declared words when the draft was filed, and a stored draft is the
        // only thing that reaches here. The list is asked again rather than the word being cast, so a
        // piece stored before a kind was retired is refused with a sentence instead of crashing.
        if (!isAKind(piece.kind)) {
          throw new PanelError(
            `This piece says it is a "${piece.kind}", and that is not a kind Mole Office has. It was stored ` +
              'before that word stopped being one. Nothing was written; reject it and file it again.',
          )
        }
        validateRecordData(piece.kind, data)
        const record = createRecord({
          kind: piece.kind,
          title,
          ...(summary === null ? {} : { summary }),
          workspaceId,
          actor,
          data: {
            ...data,
            // WHERE IT CAME FROM, ON THE RECORD ITSELF. A record accepted from a reading of somebody
            // else's folder is checkable only if it says which folder, which files and which draft.
            source: `${row.folder} — read by ${row.readBy}, accepted from folder reading ${row.id}: ${piece.from.join(', ')}`,
          },
        })
        piece.state = 'accepted'
        piece.recordId = record.id
        piece.decidedAt = now
        piece.decidedBy = actor.id
        if (body.title !== undefined || body.summary !== undefined || body.data !== undefined) {
          piece.data = { ...piece.data, editedBeforeAccepting: true }
        }
      }
      db.update(folderReadings)
        .set({ pieces, updatedAt: now })
        .where(eq(folderReadings.id, row.id))
        .run()
      return {
        piece,
        where: whereItHasGot(pieces),
        finished: everyPieceDecided(pieces),
        ...(piece.rejectionUndo === undefined ? {} : { undo: {
          token: piece.rejectionUndo.token,
          remainingMs: Math.max(0, FOLDER_REJECTION_UNDO_MS - (Date.now() - piece.rejectionUndo.atMs)),
        } }),
      } satisfies FolderPieceReply
    },
  )
}
