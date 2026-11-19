// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEED RUNS ON A FRESH DATABASE, AND NAMES THE OFFICE'S OWNER, NOBODY BUILT IN. Problem Nht4tEXhgM8B.
 *
 * Since the owner came from the installer (the owner migration `the_owner_comes_from_the_installer`), a
 * fresh database holds one person: the owner the migrate wrote, from MOLE_OFFICE_OWNER_ID, or `owner`
 * when nothing said. scripts/seed.ts still named the owner five times, so `npm run db:seed`,
 * `npm run db:reset` and tools/review.mjs (which seeds its throwaway database with scripts/reset.ts)
 * all stopped saying that nobody is registered as that person.
 *
 * WHY NOTHING CAUGHT IT. tests/every-test-process-is-given-the-test-offices-owner.ts set MOLE_OFFICE_OWNER_ID to the owner's id
 * for every test file until line round 49, and a command a test starts inherits it. So every test that ran the
 * seed had a person with the owner's id, and the seed's built-in name was right by accident. This file runs the real command,
 * scripts/reset.ts, in a child whose environment says nothing about the owner, and in one that names a
 * made-up owner.
 *
 *   1. With both owner settings empty, the seed runs to the end, and the fixture counter names the
 *      owner the migrate gave a new office when nothing said: `owner`. Empty, not left out: a setting
 *      left out is read from the .env the checkout holds, and on the owner's machine that names the owner.
 *   2. With a made-up owner, the seed runs to the end, the fixture counter and its rows name that
 *      owner, and no other person is in the database.
 *
 * Every name here is made up.
 *
 * MUTATION PROOFS (after a green control), in scripts/seed.ts:
 *   - put a fixed person's id back as the fixture counter's `createdBy`: both cases red. Nothing checks that
 *     field against the people, so the seed runs to the end and files the wrong person without a word;
 *     the cases' own reading of the counter is what catches it.
 *   - stop the seed writing the owner into the corpus: both cases red, the seed stops at its first write
 *     with Nothing is registered as the person "<the office's owner>".
 */

import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, describe, expect, it } from 'vitest'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TSX = join(REPO, 'node_modules', '.bin', 'tsx')
const work = aTestDatabaseFolder('seed-owner')
const MADE_UP_OWNER = { id: 'odile-made-up', name: 'Odile Made-Up' }
const COUNTER_TITLE = 'The review’s fixture counter'

afterAll(() => rmSync(work, { recursive: true, force: true }))

/** Run scripts/reset.ts on `file`, with the owner settings taken out of the environment and `owner` put in. */
function reset(file: string, owner: Record<string, string>): { code: number; out: string } {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('MOLE_OFFICE_OWNER_')) env[key] = value
  }
  try {
    const out = execFileSync(TSX, ['scripts/reset.ts'], {
      cwd: REPO,
      env: { ...env, MOLE_OFFICE_DB: file, ...owner },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

interface Seeded {
  owners: string[]
  people: string[]
  counter: { createdBy: unknown; mayAdd: unknown; pausedBy: unknown }
  rowsBy: string[]
}

function read(file: string): Seeded {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const owners = (db.prepare('SELECT id FROM people WHERE office_owner IS NOT NULL').all() as { id: string }[]).map((r) => r.id)
    const people = (db.prepare('SELECT id FROM people ORDER BY id').all() as { id: string }[]).map((r) => r.id)
    const row = db.prepare("SELECT id, data FROM records WHERE kind = 'counter' AND title LIKE ?").get(`${COUNTER_TITLE}%`) as
      | { id: string; data: string }
      | undefined
    if (row === undefined) throw new Error('the seed wrote no fixture counter')
    const data = JSON.parse(row.data) as { createdBy?: unknown; mayAdd?: unknown; pause?: { by?: unknown } }
    const rowsBy = (db.prepare('SELECT DISTINCT by FROM counter_rows WHERE counter_id = ? AND by IS NOT NULL').all(row.id) as { by: string }[]).map(
      (r) => r.by,
    )
    return { owners, people, counter: { createdBy: data.createdBy, mayAdd: data.mayAdd, pausedBy: data.pause?.by }, rowsBy }
  } finally {
    db.close()
  }
}

describe('the seed on a fresh database', () => {
  it('runs to the end with both owner settings empty, and names the owner a new office gets: owner', () => {
    const file = join(work, 'nothing-said.db')
    const run = reset(file, { MOLE_OFFICE_OWNER_ID: '', MOLE_OFFICE_OWNER_NAME: '' })
    expect(run.code, run.out).toBe(0)
    const seeded = read(file)
    expect(seeded.owners).toEqual(['owner'])
    const owner = { kind: 'person', id: 'owner' }
    expect(seeded.counter.createdBy).toEqual(owner)
    expect(seeded.counter.mayAdd).toEqual({ anyone: false, who: [owner] })
    expect(seeded.counter.pausedBy).toEqual(owner)
    expect(seeded.rowsBy).toEqual([`person:${owner.id}`])
  }, 300_000)

  it('runs to the end for a made-up owner, names them, and holds no other person', () => {
    const file = join(work, 'made-up.db')
    const run = reset(file, { MOLE_OFFICE_OWNER_ID: MADE_UP_OWNER.id, MOLE_OFFICE_OWNER_NAME: MADE_UP_OWNER.name })
    expect(run.code, run.out).toBe(0)
    const seeded = read(file)
    expect(seeded.owners).toEqual([MADE_UP_OWNER.id])
    expect(seeded.people, 'the seed writes no person but the owner it was given').toEqual([MADE_UP_OWNER.id])
    const owner = { kind: 'person', id: MADE_UP_OWNER.id }
    expect(seeded.counter.createdBy).toEqual(owner)
    expect(seeded.counter.mayAdd).toEqual({ anyone: false, who: [owner] })
    expect(seeded.counter.pausedBy).toEqual(owner)
    expect(seeded.rowsBy).toEqual([`person:${MADE_UP_OWNER.id}`])
  }, 300_000)
})
