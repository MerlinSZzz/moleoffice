// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO RESETS OF ONE PATH ON ONE DAY WRITE THE SAME ROWS (message 48piDyOM8Ljp, answer 3; wave 13y round 37).
 *
 * The review seeds a fresh database through scripts/reset.ts and photographs it, and two reviews of one commit drew
 * different pages: every id was drawn at random, and every record the seed wrote as happening now carried the second
 * it was written in. The secretary: "fixed ids and fixed times for every seeded record, so that two reviews draw the same
 * pages." This resets one path twice, with the review's own settings, and compares every table row by row and every
 * avatar file byte by byte.
 *
 * TWO COLUMNS ARE LEFT OUT, and only these two, because neither is the seed's to fix:
 * - `home_world` in `people` and `agents` is the database's identity: a hash of the file's path and of the moment the
 *   file was created (src/config/database-identity.mjs). Two fresh files are two databases, and a seed that made them
 *   say otherwise would be saying something false.
 * - `updated_at` in `quick_input_list` is written by migration 0272 with SQLite's own clock, which no clock in the
 *   process can reach. It says when the migration ran.
 *
 * Measured before the change, the same comparison found 15 of 87 tables different.
 */

import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { localStamp } from '../src/shared/time.ts'
import { theReviewEnvironment } from '../tools/review.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** The columns left out, by table, for the reasons in the header. */
const NOT_THE_SEEDS: Readonly<Record<string, readonly string[]>> = {
  people: ['home_world'],
  agents: ['home_world'],
  quick_input_list: ['updated_at'],
}

/** Reset `file` the way tools/review.mjs does. No server is started, so the two ports are never used. */
function reset(file: string): string {
  const env = theReviewEnvironment(process.env, 1, 2, file, () => {})
  const done = spawnSync(join(REPO, 'node_modules', '.bin', 'tsx'), ['scripts/reset.ts'], {
    cwd: REPO,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (done.status !== 0) throw new Error(`The reset of ${file} ended with ${String(done.status)}:\n${done.stdout}\n${done.stderr}`)
  return done.stdout
}

/** Every row of every table, each table's rows in the order of all of its columns, the left-out columns taken out. */
function everyRow(file: string): Map<string, unknown[]> {
  const db = new Database(file, { readonly: true })
  try {
    const tables = db.prepare("select name from sqlite_master where type = 'table' order by name").all() as { name: string }[]
    const rows = new Map<string, unknown[]>()
    for (const { name } of tables) {
      const left = NOT_THE_SEEDS[name] ?? []
      const columns = (db.prepare(`select name from pragma_table_info('${name}')`).all() as { name: string }[])
        .map((column) => column.name)
        .filter((column) => !left.includes(column))
      const list = columns.map((column) => `"${column}"`).join(', ')
      rows.set(name, db.prepare(`select ${list} from "${name}" order by ${list}`).raw().all())
    }
    return rows
  } finally {
    db.close()
  }
}

/** Every file under `folder`, by its name under it, with its bytes in base 64. */
function everyFile(folder: string): Map<string, string> {
  const files = new Map<string, string>()
  if (!existsSync(folder)) return files
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    files.set(path.slice(folder.length), readFileSync(path).toString('base64'))
  }
  return files
}

describe('two resets of one path on one day', () => {
  let first: { rows: Map<string, unknown[]>; avatars: Map<string, string> }
  let second: { rows: Map<string, unknown[]>; avatars: Map<string, string> }
  let days: [string, string]

  beforeAll(() => {
    const here = aTestDatabaseFolder('two-resets')
    const kept = aTestDatabaseFolder('the-first-reset')
    try {
      const file = join(here, 'panelx.db')
      const before = localStamp(new Date()).slice(0, 10)
      reset(file)
      cpSync(here, kept, { recursive: true })
      // The reset refuses a file that holds work, and the review never resets one, because each review has a path
      // of its own. So the first database is taken out of the folder, and the second is written at the same path.
      for (const name of readdirSync(here)) rmSync(join(here, name), { recursive: true, force: true })
      reset(file)
      days = [before, localStamp(new Date()).slice(0, 10)]
      first = { rows: everyRow(join(kept, 'panelx.db')), avatars: everyFile(join(kept, 'avatars')) }
      second = { rows: everyRow(file), avatars: everyFile(join(here, 'avatars')) }
    } finally {
      removeThisTestFolder(here)
      removeThisTestFolder(kept)
    }
  })

  it('ran on one day, so the clock both resets read was the same midnight', () => {
    expect(days[1], 'the two resets fell on two days, and their clocks read two midnights; run it again').toBe(days[0])
  })

  it('wrote the same tables', () => {
    expect([...second.rows.keys()]).toEqual([...first.rows.keys()])
    expect(first.rows.get('records')?.length ?? 0).toBeGreaterThan(200)
  })

  it('wrote the same rows in every table, ids and stamps included', () => {
    const differ = [...first.rows.keys()].filter((name) => JSON.stringify(first.rows.get(name)) !== JSON.stringify(second.rows.get(name)))
    // Joined, so a failure names every table that differs and not the first two.
    expect(differ.join(', ')).toBe('')
  })

  it('wrote the same avatar files', () => {
    expect(first.avatars.size).toBeGreaterThan(0)
    expect([...second.avatars.keys()].sort().join(', ')).toBe([...first.avatars.keys()].sort().join(', '))
    const differ = [...first.avatars.keys()].filter((name) => first.avatars.get(name) !== second.avatars.get(name))
    expect(differ).toEqual([])
  })
})
