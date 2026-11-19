// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ADD TO NOTE GOES INTO THE NOTE THE PERSON LAST WROTE IN, point QN-5 of the quick-notes package (wave 13y round 167).
 *
 * The point's words: "By default it goes into the note last written in, and the menu also offers a new note."
 *
 * WHAT "LAST WRITTEN IN" IS. Among the notes My notes lists for the reader, the one with the newest row in the office's
 * change log that the reader wrote themselves (their own actor type and id), and that files the note or changes its
 * title or what it holds. A change by another person or by an agent does not count, and neither does a move to another
 * project or a delete. The office answers it at `GET /api/records/my-notes/last-written-in`, in one read of the change
 * log over the listed notes' ids, and this test asks that door in a test office of its own.
 *
 * WHAT IS BEING PROVED, in one world whose steps follow each other.
 *   1. A reader who has written in no note is told so: the answer is no note, not a guess.
 *   2. Of two notes the person filed, the later one is answered, with the project it is in and when it was written.
 *   3. A later change of the older note's parts makes it the one, and so does a later change of a title alone.
 *   4. A later change by an agent, or by another person, does not make a note the one.
 *   5. A move to another project does not make a note the one.
 *   6. A deleted note is never answered. The note the person wrote in before it is.
 *
 * MUTATION PROOF (after a red control on the code as cut, where the door does not exist):
 *   - In src/server/lib/my-notes.ts, read the rows of every writer and not only the reader's own: cases 1 and 4 go red.
 *   - Read every kind of change row, a move's included: case 5 goes red.
 *   - Ask the change log over every note there is, and not over the notes My notes lists: case 6 goes red.
 *
 * Every note here is made up, and its words say so. The database is the test's own.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AGENT, apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { NoteLastWrittenIn } from '../src/shared/my-notes.ts'
import type { QuickNotePart } from '../src/shared/kinds/quick-note.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const ANOTHER_PERSON = { type: 'human', id: 'made-up-other-person' } as const
const KILNS = 'test-made-up-kilns'
const GARDEN = 'test-made-up-garden'

const notes = { agents: '', anothers: '', older: '', newer: '' }

const words = (text: string): QuickNotePart[] => [{ id: 'w-1', type: 'words', x: 40, y: 32, width: 320, text }]

function aNote(workspaceId: string, text: string, actor: typeof t.api.HUMAN): string {
  return t.api.createRecord({ kind: 'quick_note', title: text, data: { parts: words(text) }, workspaceId, actor }).id
}

async function lastWrittenIn(): Promise<{ status: number; body: NoteLastWrittenIn & { error?: string } }> {
  const res = await app.inject({ method: 'GET', url: '/api/records/my-notes/last-written-in', headers: AS_THE_PERSON })
  return { status: res.statusCode, body: res.json() }
}

beforeAll(async () => {
  t = await freshDb()
  const workspaces = await import('../src/server/lib/workspaces.ts')
  workspaces.createWorkspace({ id: KILNS, title: 'Made-up kilns' })
  workspaces.createWorkspace({ id: GARDEN, title: 'Made-up garden' })
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the note Add to note goes into, as the office reads it', () => {
  it('answers no note to a person who has written in none, though an agent and another person have', async () => {
    notes.agents = aNote(KILNS, 'A made-up note an agent wrote', AGENT)
    notes.anothers = aNote(GARDEN, 'A made-up note another person wrote', ANOTHER_PERSON)
    const { status, body } = await lastWrittenIn()
    expect(status).toBe(200)
    // Every answer the office sends also carries narrowedByPermission (the reply hook), so the two fields are asked alone.
    expect(body.note).toBeNull()
    expect(body.writtenAt).toBeNull()
  })

  it('answers the note the person filed last, with its project and when it was written', async () => {
    notes.older = aNote(KILNS, 'Made-up kiln log', t.api.HUMAN)
    notes.newer = aNote(GARDEN, 'Made-up shelf plan', t.api.HUMAN)
    const { status, body } = await lastWrittenIn()
    expect(status).toBe(200)
    expect(body.note?.id).toBe(notes.newer)
    expect(body.note?.workspaceId).toBe(GARDEN)
    expect(body.note?.kind).toBe('quick_note')
    expect(body.writtenAt).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/u)
  })

  it('answers an older note once the person changes what it holds, and a note whose title alone they changed', async () => {
    t.api.patchRecord(notes.older, { dataPatch: { parts: words('Made-up kiln log\nFired again at a made-up 950 degrees.') } }, t.api.HUMAN)
    expect((await lastWrittenIn()).body.note?.id).toBe(notes.older)

    t.api.patchRecord(notes.newer, { title: 'Made-up shelf plan, renamed' }, t.api.HUMAN)
    expect((await lastWrittenIn()).body.note?.id).toBe(notes.newer)
  })

  it('does not count a later change by an agent or by another person', async () => {
    t.api.patchRecord(notes.older, { dataPatch: { parts: words('Made-up kiln log, as an agent wrote it') } }, AGENT)
    expect((await lastWrittenIn()).body.note?.id).toBe(notes.newer)

    t.api.patchRecord(notes.older, { dataPatch: { parts: words('Made-up kiln log, as another person wrote it') } }, ANOTHER_PERSON)
    expect((await lastWrittenIn()).body.note?.id).toBe(notes.newer)
  })

  it('does not count a move to another project', async () => {
    const moved = await app.inject({
      method: 'POST',
      url: `/api/records/${notes.older}/workspace`,
      headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': KILNS },
      payload: { to: GARDEN },
    })
    expect(moved.statusCode, moved.body).toBe(200)
    const { body } = await lastWrittenIn()
    expect(body.note?.id).toBe(notes.newer)
  })

  it('never answers a deleted note, and answers the one the person wrote in before it', async () => {
    t.api.deleteRecord(notes.newer, t.api.HUMAN)
    const { body } = await lastWrittenIn()
    expect(body.note?.id).toBe(notes.older)
    expect(body.note?.workspaceId).toBe(GARDEN)
  })
})
