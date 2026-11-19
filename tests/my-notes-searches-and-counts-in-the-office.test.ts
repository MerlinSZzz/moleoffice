// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MY NOTES IS SEARCHED AND COUNTED BY THE OFFICE, point QN-3 of the quick-notes package (wave 13y round 167).
 *
 * The point's words: "My notes can be searched, and a note can be moved into a project.
 * The chips and the week headings carry their counts as option C's step 6 picture draws them, counted over all notes
 * by the office, not over the loaded cards."
 *
 * WHAT IS BEING PROVED, through `GET /api/records/my-notes` in a test office of its own.
 *   1. Every note of every project is listed, the newest started first, and a deleted note is neither listed nor
 *      counted. No rule keeps a reader out of a whole project today (`theProjectsAReaderMayRead` in
 *      src/server/lib/across-projects.ts answers every project), so what is tested is that the notes of every project
 *      are read, through the same rule the records door reads `?projects=all` with.
 *   2. Each choice above the list is counted over every note the search keeps, whatever choice is shown.
 *   3. A search looks in what a note says, the name of the page it was started on, and what was copied into it, and
 *      never in its part types or colours. A note with a red stroke that says no "red" is not found by "red".
 *   4. The weeks are counted on the calendar of the zone the page sends. A note started at 00:30 on a Monday in
 *      Shanghai is in that Monday's week there, and in the week before in London, where it is still Sunday.
 *   5. A zone the office does not know is refused in words, and the answer names the zone it counted in.
 *   6. A page of the list carries the counts and weeks of every chosen note, not of the page.
 *
 * MUTATION PROOF (after a red control on the code as cut, where the door does not exist):
 *   - In src/server/lib/my-notes.ts, ask `saysIt` of the whole note instead of its words: case 3 goes red on "red".
 *   - Count the weeks in the office clock's zone instead of the one asked: case 4 goes red.
 *   - Count the choices over the chosen notes instead of the searched ones: case 2 goes red.
 *
 * Every note here is made up, and its words say so. The database is the test's own.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { stampInZone, theClockZone } from '../src/shared/time.ts'
import type { MyNotesReply } from '../src/shared/my-notes.ts'
import type { QuickNotePart } from '../src/shared/kinds/quick-note.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const KILNS = 'test-made-up-kilns'
const GARDEN = 'test-made-up-garden'

/** 00:30 on Monday 9 November 2026 in Shanghai, which is 16:30 on Sunday 8 November in London. */
const A_SHANGHAI_MONDAY = Date.parse('2026-11-08T16:30:00Z')

const notes = { words: '', drawn: '', added: '', deleted: '' }

function aNote(workspaceId: string, title: string, parts: QuickNotePart[], startedAt: number, fromPage?: { address: string; name: string }): string {
  const id = t.api.createRecord({
    kind: 'quick_note',
    title,
    data: { parts, ...(fromPage === undefined ? {} : { from_page: fromPage }) },
    workspaceId,
    actor: t.api.HUMAN,
  }).id
  // THE OFFICE WRITES A STAMP ON ITS OWN CLOCK, so the moment is written the same way here.
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(stampInZone(startedAt, theClockZone()), id)
  return id
}

async function read(query: string): Promise<{ status: number; body: MyNotesReply & { error?: string } }> {
  const res = await app.inject({ method: 'GET', url: `/api/records/my-notes${query}`, headers: AS_THE_PERSON })
  return { status: res.statusCode, body: res.json() }
}

const ids = (reply: MyNotesReply): string[] => reply.notes.map((note) => note.id)

beforeAll(async () => {
  t = await freshDb()
  const workspaces = await import('../src/server/lib/workspaces.ts')
  workspaces.createWorkspace({ id: KILNS, title: 'Made-up kilns' })
  workspaces.createWorkspace({ id: GARDEN, title: 'Made-up garden' })
  app = (await apiApp()).app
  await app.ready()

  notes.words = aNote(
    KILNS,
    'Made-up kiln log',
    [{ id: 'w-1', type: 'words', x: 40, y: 32, width: 320, text: 'Made-up kiln log\nLit at a made-up 900 degrees.' }],
    A_SHANGHAI_MONDAY,
  )
  notes.drawn = aNote(
    GARDEN,
    'Made-up shelf plan',
    [
      { id: 'w-1', type: 'words', x: 40, y: 32, width: 320, text: 'Made-up shelf plan' },
      { id: 'b-1', type: 'box', x: 40, y: 180, width: 160, height: 72, text: 'Made-up kiln door' },
      { id: 's-1', type: 'stroke', colour: 'red', width: 2, points: [40, 120, 52, 124] },
    ],
    Date.parse('2026-11-10T09:00:00Z'),
    { address: '#/records', name: 'Everything' },
  )
  notes.added = aNote(
    KILNS,
    'A made-up note with no words',
    [
      {
        id: 'a-1',
        type: 'added',
        x: 40,
        y: 32,
        width: 320,
        at: '2026-11-11 09:00:00',
        from: { address: '#/records', name: 'Made-up glaze page' },
        copy: { type: 'card', recordId: 'made-up-id', kind: 'report', title: 'Made-up glaze report' },
      },
    ],
    Date.parse('2026-11-11T09:00:00Z'),
    { address: '#/records', name: 'Made-up glaze page' },
  )
  notes.deleted = aNote(GARDEN, 'Made-up deleted kiln note', [{ id: 'w-1', type: 'words', x: 0, y: 0, width: 200, text: 'Made-up deleted kiln note' }], Date.parse('2026-11-12T09:00:00Z'))
  t.api.deleteRecord(notes.deleted, t.api.HUMAN)
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('My notes, as the office reads it', () => {
  it('lists every note of every project, the newest started first, and not a deleted one', async () => {
    const { status, body } = await read('?zone=Europe%2FLondon')
    expect(status).toBe(200)
    expect(ids(body)).toEqual([notes.added, notes.drawn, notes.words])
    expect(body.notes.map((note) => note.workspaceId)).toEqual([KILNS, GARDEN, KILNS])
    expect(body.counts).toEqual({ all: 3, 'from-a-page': 2, 'from-no-page': 1, drawn: 1 })
    expect(body.matched).toBe(3)
  })

  it('counts every choice over the notes the search keeps, whichever choice is shown', async () => {
    const { body } = await read('?only=drawn&zone=Europe%2FLondon')
    expect(ids(body)).toEqual([notes.drawn])
    expect(body.choice).toBe('drawn')
    expect(body.matched).toBe(1)
    expect(body.counts).toEqual({ all: 3, 'from-a-page': 2, 'from-no-page': 1, drawn: 1 })

    const searched = await read('?q=kiln&only=from-no-page&zone=Europe%2FLondon')
    expect(ids(searched.body)).toEqual([notes.words])
    expect(searched.body.counts).toEqual({ all: 2, 'from-a-page': 1, 'from-no-page': 1, drawn: 1 })
  })

  it('searches what a note says, where it was started and what was copied in, and never its parts’ types or colours', async () => {
    expect(ids((await read('?q=kiln')).body)).toEqual([notes.drawn, notes.words])
    expect(ids((await read('?q=glaze%20report')).body)).toEqual([notes.added])
    expect(ids((await read('?q=Everything')).body)).toEqual([notes.drawn])
    // THE DRAWN NOTE HOLDS A RED STROKE AND A BOX, and says neither word.
    const red = await read('?q=red')
    expect(ids(red.body)).toEqual([])
    expect(red.body.counts.all).toBe(0)
    expect(ids((await read('?q=stroke')).body)).toEqual([])
    expect((await read('?q=kiln')).body.q).toBe('kiln')
  })

  it('counts the weeks on the calendar of the zone the page sends', async () => {
    const shanghai = (await read('?zone=Asia%2FShanghai')).body
    expect(shanghai.zone).toBe('Asia/Shanghai')
    expect(shanghai.notes.find((note) => note.id === notes.words)?.week).toBe('2026-11-09')
    expect(shanghai.weeks).toEqual([{ starts: '2026-11-09', count: 3 }])

    const london = (await read('?zone=Europe%2FLondon')).body
    expect(london.zone).toBe('Europe/London')
    expect(london.notes.find((note) => note.id === notes.words)?.week).toBe('2026-11-02')
    expect(london.weeks).toEqual([
      { starts: '2026-11-09', count: 2 },
      { starts: '2026-11-02', count: 1 },
    ])
  })

  it('refuses a zone it does not know, and says which zone it counted in when none is sent', async () => {
    const unknown = await read('?zone=Made-up%2FNowhere')
    expect(unknown.status).toBe(400)
    expect(unknown.body.error).toContain('Made-up/Nowhere')
    expect((await read('?zone=%20')).status).toBe(400)
    const none = await read('')
    expect(none.status).toBe(200)
    expect(none.body.zone).toBe(theClockZone())
  })

  it('gives one page of notes with the counts and weeks of every chosen note', async () => {
    const first = (await read('?limit=2&offset=0&zone=Asia%2FShanghai')).body
    expect(ids(first)).toEqual([notes.added, notes.drawn])
    expect({ matched: first.matched, returned: first.returned, left: first.left }).toEqual({ matched: 3, returned: 2, left: 1 })
    expect(first.weeks).toEqual([{ starts: '2026-11-09', count: 3 }])
    const second = (await read('?limit=2&offset=2&zone=Asia%2FShanghai')).body
    expect(ids(second)).toEqual([notes.words])
    expect(second.left).toBe(0)
  })
})
