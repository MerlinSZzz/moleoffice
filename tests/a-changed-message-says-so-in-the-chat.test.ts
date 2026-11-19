// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE WHOSE WORDS WERE CHANGED SAYS SO, AND ITS WRITER IS OFFERED EDIT WHILE THE WINDOW IS OPEN.
 * Point 2 of a decision, in wave 13u round 14. Who may change a message is set by
 * another decision, and
 * tests/only-its-writer-changes-a-message measures the refusals; this file measures what the wire and the chat say.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A message nobody changed reads `edited: null`, and `wordsMayChangeUntil` is the time it was written and the edit
 *      window, as an ISO time.
 *   2. After its writer changes the words, the message reads `edited` with when, by whom, and the words as first
 *      written. A second change keeps the first words.
 *   3. A line from Mole Office reads `wordsMayChangeUntil: null`, because nobody may change it.
 *   4. A comment nobody has been handed reads `wordsMayChangeUntil: null`: it has no window.
 *   5. The chat's mark draws "edited", closed, with the original words not yet shown. Nothing is drawn for a message
 *      nobody changed.
 *   6. The chat's Edit press is drawn while the window is open, and not when it has closed or there is none.
 *
 * WHAT IS NOT CLAIMED. The press that opens the original, and the check in Chat.tsx that offers Edit on the reader's
 * own messages only, need a browser; this file draws without one. The round's pictures show both, and the record door
 * refuses a change by anybody but the writer whatever a screen drew.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the commit that added the mark has the runs)
 * ---------------------------------------------------------------------------------------
 *
 *   - `asMessage` sending `edited: null` always: case 2 goes red;
 *   - `theWordsMayChangeUntil` not asking whether the writer is Mole Office: case 3 goes red;
 *   - `asMessage` asking the window of a comment nobody has been handed: case 4 goes red;
 *   - `EditPress` drawn whatever the time: case 6 goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, theAnswerToAWriteInATestOffice, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The edit window this file sets, in seconds, so the expected time does not lean on the default. */
const WINDOW_SECONDS = 120

let t: TestDb
let app: FastifyInstance
let chat: typeof import('../src/web/components/ChatEdited.tsx')

interface Wire {
  edited: { at: string; by: { kind: string; id: string } | null; original: { title: string | null; body: string | null } } | null
  wordsMayChangeUntil: string | null
  sentAt: string
  body: string
}

async function theWire(id: string): Promise<Wire> {
  const read = await app.inject({ method: 'GET', url: `/api/messages/${id}`, headers: AS_THE_PERSON })
  expect(read.statusCode, read.body.slice(0, 300)).toBe(200)
  return (read.json() as { message: Wire }).message
}

async function aMessage(body: string, data: Record<string, unknown> = { to: [{ kind: 'agent', id: 'kiln-reader' }] }): Promise<string> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'message', title: body.slice(0, 40), data: { body, ...data } },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(theAnswerToAWriteInATestOffice(AS_THE_PERSON, { kind: 'message', data: { body, ...data } }))
  return (filed.json() as { record: { id: string } }).record.id
}

async function change(id: string, body: string): Promise<void> {
  const changed = await app.inject({
    method: 'PATCH',
    url: `/api/records/${id}`,
    headers: AS_THE_PERSON,
    payload: { title: body.slice(0, 40), dataPatch: { body } },
  })
  expect(changed.statusCode, changed.body.slice(0, 300)).toBe(200)
}

/** The stored written time, read the way the server reads it: local time, to the second. */
function writtenAt(stamp: string): number {
  const [day, time] = stamp.split(' ')
  const [y, m, d] = day!.split('-').map(Number)
  const [hh, mm, ss] = time!.split(':').map(Number)
  return new Date(y!, m! - 1, d!, hh!, mm!, ss!).getTime()
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS = String(WINDOW_SECONDS)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { runtime: 'claude-code', handle: 'kiln-reader', name: 'A made-up kiln reader', role: 'worker' },
  })
  expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
  chat = await import('../src/web/components/ChatEdited.tsx')
}, 90_000)

afterAll(async () => {
  delete process.env.MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS
  await app?.close()
  t?.close()
})

describe('a changed message says so', () => {
  it('1: a message nobody changed carries no mark, and the time its words may change until', async () => {
    const id = await aMessage('The tray holds 24 pots.')
    const wire = await theWire(id)
    expect(wire.edited).toBeNull()
    expect(wire.wordsMayChangeUntil).not.toBeNull()
    expect(Date.parse(wire.wordsMayChangeUntil!)).toBe(writtenAt(wire.sentAt) + WINDOW_SECONDS * 1000)
  })

  it('2: after its writer changes the words, the message carries when, by whom and the first words', async () => {
    const id = await aMessage('The tray holds 24 pots.')
    await change(id, 'The tray holds 30 pots.')
    const once = await theWire(id)
    expect(once.body).toBe('The tray holds 30 pots.')
    expect(once.edited?.by).toEqual({ kind: 'person', id: THE_PERSON })
    expect(once.edited?.original.body).toBe('The tray holds 24 pots.')
    expect(once.edited?.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    await change(id, 'The tray holds 36 pots.')
    const twice = await theWire(id)
    expect(twice.edited?.original.body, 'a second change keeps the words as first written').toBe('The tray holds 24 pots.')
  })

  it('3: a line from Mole Office may be changed by nobody', async () => {
    const { writeASystemLineToOne } = await import('../src/server/lib/groups.ts')
    const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
    const line = writeASystemLineToOne(
      { kind: 'person', id: THE_PERSON },
      'default',
      SYSTEM_LINES.aTerminalUsedFromAnotherComputer('The terminal "a made-up command" was read', null),
      { type: 'system', id: 'mole-office' },
    )
    const wire = await theWire(line.id)
    expect(wire.wordsMayChangeUntil).toBeNull()
    expect(wire.edited).toBeNull()
  })

  it('4: a comment nobody has been handed has no window', async () => {
    const note = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'note', title: 'A made-up note to point at', data: { body: 'Made up.' } },
    })
    expect(note.statusCode, note.body.slice(0, 300)).toBe(201)
    const recordId = (note.json() as { record: { id: string } }).record.id
    const id = await aMessage('Check this count.', { target: { target: { kind: 'record', recordId, workspaceId: 'default' } } })
    const wire = await theWire(id)
    expect(wire.wordsMayChangeUntil).toBeNull()
  })

  it('5: the mark draws "edited", closed, and nothing for a message nobody changed', () => {
    const drawn = renderToStaticMarkup(
      h(chat.EditedMark, { edited: { at: '2026-10-11 09:30:00', by: { kind: 'person', id: THE_PERSON }, original: { title: null, body: 'Made-up first words.' } } }),
    )
    expect(drawn).toContain(`>${en['chat.edited.mark']}</button>`)
    expect(drawn).toContain('aria-expanded="false"')
    expect(drawn, 'the original waits for the press').not.toContain('Made-up first words.')
    expect(renderToStaticMarkup(h(chat.EditedMark, { edited: null }))).toBe('')
  })

  it('6: Edit is drawn while the window is open, and not after it or without one', () => {
    const press = (until: string | null): string => renderToStaticMarkup(h(chat.EditPress, { id: 'a-made-up-id', body: 'Made up.', until, onSaved: () => {} }))
    expect(press(new Date(Date.now() + 60_000).toISOString())).toContain(`>${en['chat.edit.press']}</button>`)
    expect(press(new Date(Date.now() - 1_000).toISOString())).toBe('')
    expect(press(null)).toBe('')
  })
})
