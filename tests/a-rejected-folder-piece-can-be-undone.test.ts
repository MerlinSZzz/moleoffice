// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { FolderPieceReply, FolderReading, FolderReadingPiece } from '../src/shared/folderreading.ts'
import { FOLDER_REJECTION_UNDO_MS } from '../src/shared/danger-tiers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { folderReadings } from '../src/server/db/schema.ts'

let database: TestDb
let app: FastifyInstance
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

beforeAll(async () => {
  database = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})
afterAll(async () => { await app?.close(); database?.close() })

it('restores only the unchanged rejected piece during its offer, records the caller, and refuses stale or unproved acts before writing', async () => {
  const filed = await app.inject({ method: 'POST', url: '/api/import/draft', headers, payload: {
    folder: '/made-up/elm-observatory', pieces: [0, 1].map(n => ({
      kind: 'note', title: `Made-up observation ${n}`, data: {}, from: ['NOTES.md'], quote: 'This is made-up material for the undo test.',
    })),
  } })
  expect(filed.statusCode, filed.body).toBe(201)
  const draft = filed.json().draft as FolderReading
  const first = draft.pieces[0]!
  const second = draft.pieces[1]!
  const url = (piece: FolderReadingPiece) => `/api/import/drafts/${draft.id}/pieces/${piece.id}`
  const read = () => database.client.db.select().from(folderReadings).where(eq(folderReadings.id, draft.id)).get()!
  const press = (piece: FolderReadingPiece, payload: unknown, as = headers) => app.inject({ method: 'POST', url: url(piece), headers: as, payload: JSON.stringify(payload) })
  const rejected = await press(first, { press: 'reject' })
  expect(rejected.statusCode, rejected.body).toBe(200)
  const offer = rejected.json() as FolderPieceReply
  expect(offer.undo?.remainingMs).toBeGreaterThan(0)
  expect(offer.undo?.remainingMs).toBeLessThanOrEqual(FOLDER_REJECTION_UNDO_MS)
  expect(offer.piece.state).toBe('rejected')
  const token = offer.undo!.token

  const refusesUnchanged = async (piece: FolderReadingPiece, body: unknown, status: number, as = headers) => {
    const before = read()
    const reply = await press(piece, body, as)
    expect(reply.statusCode, reply.body).toBe(status)
    expect(read()).toEqual(before)
  }
  await refusesUnchanged(second, { press: 'undo-reject', token }, 409)
  await refusesUnchanged(first, { press: 'undo-reject', token: 'another-offer' }, 409)
  await refusesUnchanged(first, { press: 'undo-reject', token, title: 'Unasked edit' }, 400)
  const registration = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: 'elm-reader', name: 'Elm reader' } })
  expect(registration.statusCode, registration.body).toBe(201)
  await refusesUnchanged(first, { press: 'undo-reject', token }, 403,
    { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'elm-reader' })

  const time = vi.spyOn(Date, 'now').mockReturnValue(offer.piece.rejectionUndo!.atMs + FOLDER_REJECTION_UNDO_MS)
  try { await refusesUnchanged(first, { press: 'undo-reject', token }, 409) } finally { time.mockRestore() }
  const rejectedRow = read()
  const changed = (rejectedRow.pieces as FolderReadingPiece[]).map(piece => piece.id === first.id ? { ...piece, title: 'Changed after rejection' } : piece)
  database.client.db.update(folderReadings).set({ pieces: changed }).where(eq(folderReadings.id, draft.id)).run()
  await refusesUnchanged(first, { press: 'undo-reject', token }, 409)
  database.client.db.update(folderReadings).set({ pieces: rejectedRow.pieces }).where(eq(folderReadings.id, draft.id)).run()

  const undone = await press(first, { press: 'undo-reject', token })
  expect(undone.statusCode, undone.body).toBe(200)
  const restored = undone.json() as FolderPieceReply
  expect(restored.piece).toMatchObject({ state: 'proposed', decidedAt: null, decidedBy: null,
    lastRejectionUndo: { by: THE_PERSON } })
  expect(restored.piece.lastRejectionUndo?.at).toBeTruthy()
  expect(restored.piece.rejectionUndo).toBeUndefined()
  expect((read().pieces as FolderReadingPiece[])[1]).toEqual(second)
  expect(restored.where).toEqual({ proposed: 2, accepted: 0, rejected: 0 })
  expect(restored.finished).toBe(false)
  await refusesUnchanged(first, { press: 'undo-reject', token }, 409)

  const again = (await press(first, { press: 'reject' })).json() as FolderPieceReply
  expect(again.undo?.token).not.toBe(token)
  await refusesUnchanged(first, { press: 'undo-reject', token }, 409)
})
