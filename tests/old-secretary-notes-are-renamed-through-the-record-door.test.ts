// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SECRETARY NOTES MADE UNDER THE OLD TITLE ARE RENAMED THROUGH THE RECORD'S OWN DOOR, AND THE OLD TITLE STAYS IN THE
 * HISTORY. Item 3 of a decision took round 19's recommendation, in report bdR-Vb2wif9d
 * block b-9.
 *
 * Secretary notes made before a decision are titled "<handle>: the notebook". New ones are
 * titled "<handle>: secretary notes" (src/server/api/notebook.ts). No migration rewrites the old titles, because a
 * title changed with no line in the record's history would be a change nobody can see. The old ones are renamed by the
 * secretary, after this lands, with an ordinary write: PATCH /api/records/<id> {"title": ...}.
 *
 * WHAT THIS HOLDS, in a test office of its own:
 *   1. A secretary renames its own notes from "<handle>: the notebook" to "<handle>: secretary notes".
 *   2. The same secretary renames another secretary's notes the same way.
 *   3. After each rename, the record's history still has the old title: the newest revision says the title went
 *      from the old one to the new one, and revision 1 holds the old title whole.
 *   4. The entries are untouched by the rename.
 *
 * HOW THE OLD NOTES ARE MADE. The notebook door no longer makes the old title, so each one is filed with
 * POST /api/records as the person, with the old title and no entries (which `checkTheNotebookEntries` in
 * src/server/lib/records/notebook-entries.ts allows on a create), and its first entry is then written through the notebook door.
 * The record's history then starts with the old title, as the two old notes in the office do.
 *
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST: make `patchRecord` in src/server/lib/records.ts refuse
 * a title change on a `notebook` record (a 403 thrown where the notebook check sits) → holds 1 and 2 go red with
 * that refusal.
 *
 * Made-up names only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}
const asAgent = (handle: string): Record<string, string> => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

async function call(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    parsed = {}
  }
  return { status: reply.status, said: String(parsed['error'] ?? text).slice(0, 600), body: parsed }
}

/** Notes made the way the office made them before a decision: the old title, then a first
 * entry. */
async function oldNotesFor(handle: string, words: string): Promise<string> {
  const filed = await call('POST', '/api/records', PERSON, {
    kind: 'notebook',
    title: `${handle}: the notebook`,
    data: { agentHandle: handle, entries: [] },
  })
  expect(filed.status, filed.said).toBe(201)
  const id = String((filed.body['record'] as { id: string }).id)
  const written = await call('POST', `/api/agents/${handle}/notebook/entries`, PERSON, { entryKind: 'how-he-wants-answers', text: words })
  expect(written.status, written.said).toBe(201)
  expect((written.body as { recordId?: string }).recordId, 'the entry went into these notes').toBe(id)
  return id
}

interface Revision {
  seq: number
  changed: { path: string; before: unknown; after: unknown }[] | null
}

/** The rename, the request the secretary will send, and what the record and its history say afterwards. */
async function renameAndReadBack(id: string, handle: string, by: string, words: string): Promise<void> {
  const renamed = await call('PATCH', `/api/records/${id}`, asAgent(by), { title: `${handle}: secretary notes` })
  expect(renamed.status, renamed.said).toBe(200)

  const now = await call('GET', `/api/records/${id}`, PERSON)
  expect(now.status, now.said).toBe(200)
  const record = (now.body['record'] ?? now.body) as { title: string; data: { entries: { text: string }[] } }
  expect(record.title).toBe(`${handle}: secretary notes`)
  expect(record.data.entries.map((one) => one.text), 'the entries are untouched').toEqual([words])

  const listing = await call('GET', `/api/records/${id}/revisions`, PERSON)
  expect(listing.status, listing.said).toBe(200)
  const revisions = listing.body['revisions'] as Revision[]
  const newest = revisions[0]!
  expect(newest.changed, 'the newest revision says what the title was').toContainEqual(
    expect.objectContaining({ path: 'title', before: `${handle}: the notebook`, after: `${handle}: secretary notes` }),
  )
  const first = await call('GET', `/api/records/${id}/revisions/1`, PERSON)
  expect(first.status, first.said).toBe(200)
  expect((first.body['content'] as { title: string }).title, 'revision 1 holds the old title whole').toBe(`${handle}: the notebook`)
}

beforeAll(async () => {
  app = await liveApp({ name: 'old-notes-renamed', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  for (const [handle, name] of [['quill', 'Quill'], ['tansy', 'Tansy']] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name, role: 'secretary' })
    expect(started.status, started.said).toBe(201)
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('old secretary notes are renamed through the record door', () => {
  it('a secretary renames its own notes, and the old title stays in the history', async () => {
    const words = 'Answer with the conclusion first.'
    const id = await oldNotesFor('quill', words)
    await renameAndReadBack(id, 'quill', 'quill', words)
  }, 120_000)

  it('the same secretary renames another secretary’s notes, and the old title stays in the history', async () => {
    const words = 'Keep the pottery orders apart from the bakery ones.'
    const id = await oldNotesFor('tansy', words)
    await renameAndReadBack(id, 'tansy', 'quill', words)
  }, 120_000)
})
