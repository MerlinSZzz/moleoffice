// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COUNT OF WHAT THE KEY RULE WOULD REFUSE READS ONLY A COPY, AND PRINTS NO RECORD'S TEXT, TITLE OR ID (wave 13w
 * round 4). The command is scripts/count-what-the-key-rule-would-refuse.ts.
 *
 * Every record here is made up for the test, in a fresh test database, and the copy is made inside this test's own
 * temporary folder. The made-up hash is put together when the test runs.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · named the database the settings name, it refuses, exits 2 and prints nothing to standard output.
 *     MUTATION: take out the `copy === live` refusal. Red.
 *   · named a copy, it counts a note whose body holds a 64-hex run, by kind, field, shape, class and length, and a
 *     message whose `from` holds one by the message door's own list, and prints neither the run, nor a title, nor an id.
 *     MUTATION: add the record's title to each counted line. Red.
 *     MUTATION: count messages by their body alone, theWordsOfAMessage left out. The message count is 0, and this is red.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

const A_HASH = 'fedcba9876543210'.repeat(4)
const NOTE_TITLE = 'Test: a note that names a made-up file hash'

let t: TestDb
let dir = ''
let copy = ''
const ids: string[] = []

function count(path: string): { status: number | null; out: string; err: string } {
  const ran = spawnSync('npx', ['tsx', 'scripts/count-what-the-key-rule-would-refuse.ts', path], {
    encoding: 'utf8',
    env: { ...process.env, MOLE_OFFICE_DB: t.file },
    timeout: 120_000,
  })
  return { status: ran.status, out: ran.stdout, err: ran.stderr }
}

beforeAll(async () => {
  t = await freshDb()
  const actor = { type: 'human', id: 'owner' } as const
  ids.push(t.api.createRecord({ workspaceId: 'default', kind: 'note', title: NOTE_TITLE, data: { body: `Test: the file's hash is ${A_HASH}.` }, actor }).id)
  // A MESSAGE STORED BEFORE ITS `from` WAS JUDGED, written straight into the table as an older office would hold it.
  const message = 'tKr4msg0A1b2'
  // Every other column is the note's: only the id, the kind, the title and the data are the message's own.
  t.client.sqlite.exec('CREATE TEMP TABLE one AS SELECT * FROM records WHERE id = ' + `'${ids[0]}'`)
  t.client.sqlite
    .prepare("UPDATE one SET id = ?, kind = 'message', title = 'Test: an older message', data = ?")
    .run(message, JSON.stringify({ body: 'Test: ordinary words.', from: `Test: ${A_HASH}` }))
  t.client.sqlite.exec('INSERT INTO records SELECT * FROM one; DROP TABLE one')
  ids.push(message)
  dir = mkdtempSync(join(tmpdir(), 'mole-office-count-copy-'))
  copy = join(dir, 'copy.db')
  t.client.sqlite.exec(`VACUUM INTO '${copy}'`)
})

afterAll(() => {
  t?.close()
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

describe('the count of what the key rule would refuse', () => {
  it('refuses the database the settings name', () => {
    const ran = count(t.file)
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain('That is the live database')
    expect(ran.out).toBe('')
  })

  it('counts a copy by kind, field and shape, and prints no text, title or id', () => {
    const ran = count(copy)
    expect(ran.status, ran.err).toBe(0)
    expect(ran.out).toMatch(/^1 \| note \| data\.body \| longRun \| 64 hex \| 64 or more$/m)
    expect(ran.out).toMatch(/^1 \| message \| data\.from \| longRun \| 64 hex \| 64 or more$/m)
    expect(ran.out).toContain("MESSAGES THE MESSAGE DOOR WOULD REFUSE, by its own list of a message's words (an upper bound): 1")
    expect(ran.out).not.toContain(A_HASH)
    expect(ran.out).not.toContain(NOTE_TITLE)
    expect(ran.out).not.toContain('Test: an older message')
    for (const id of ids) expect(ran.out).not.toContain(id)
  })
})
