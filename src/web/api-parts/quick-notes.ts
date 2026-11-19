// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13y, pages and speed. The note page's doors: filing a quick note, and storing a picture or a film it holds.
// src/web/api-parts/join.ts joins every part into `api`.
import { json, request, type RecordChangeReply, type RecordReply } from '../api.ts'

/** The four facts POST /api/report-files hands back about a file it has stored. A note's picture part keeps all four. */
export interface AStoredFile {
  path: string
  name: string
  size: number
  hash: string
}

export const quickNotesDoors = {
  /**
   * FILE A NEW QUICK NOTE, AND HAND BACK THE VERSION ITS NEXT SAVE IS BUILT ON.
   *
   * POST /api/records answers `version` on every 201 (`recordReply` in src/server/api/records.ts), and the note page
   * sends it as `ifVersion` on the next save, so a note changed somewhere else is refused rather than written over.
   * `createRecord` types the reply without it, so this door names it.
   */
  fileAQuickNote: (input: { title: string; data: Record<string, unknown> }) =>
    request<RecordReply & { version: string }>('/api/records', {
      method: 'POST',
      body: json({ kind: 'quick_note', ...input }),
    }),

  /**
   * KEEP A NOTE'S PARTS, WHOLE, ON THE VERSION THE LAST SAVE STORED. The office refuses it with 409 and stores nothing
   * when the note holds another version now, so a note changed in another window is not written over.
   *
   * `leaving` says the page is being hidden or closed. The save is then sent so that it goes on after the page has
   * gone (`keepalive`), which a browser does only for a body under 64 KiB, so the page asks for it only below that.
   */
  changeAQuickNote: (id: string, change: { title?: string; parts: unknown[]; ifVersion: string }, leaving = false) =>
    request<RecordChangeReply>(`/api/records/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json({ ...(change.title === undefined ? {} : { title: change.title }), dataPatch: { parts: change.parts }, ifVersion: change.ifVersion }),
      ...(leaving ? { keepalive: true } : {}),
    }),

  /**
   * STORE ONE FILE THE PERSON PASTED OR DROPPED INTO A NOTE. The bytes go as base64, and the reply names where they are
   * kept. The note keeps that path and never the bytes.
   */
  storeANoteFile: (bytes: string, name: string) =>
    request<{ file: AStoredFile }>('/api/report-files', {
      method: 'POST',
      body: json({ bytes, name }),
    }).then((reply) => reply.file),
}
