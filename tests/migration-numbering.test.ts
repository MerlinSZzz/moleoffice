// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MIGRATION FILE THAT IS NOT IN THE JOURNAL NEVER RUNS.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE EXISTS TO MAKE IMPOSSIBLE
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/db/migrate.ts` imports drizzle's own migrator and hands it `{ migrationsFolder }`.
 * That migrator does not read the folder. It reads `drizzle/meta/_journal.json` and applies the
 * entries listed there, in order, resolving each entry's `tag` to a `.sql` file beside it.
 *
 * So a `.sql` file with no journal entry is invisible. It sits in the folder looking exactly like
 * a migration, and nothing it contains ever reaches a database. Its table is never created. Every
 * test that depends on that table then fails for a reason that has nothing to do with the feature,
 * and the search starts in the wrong place.
 *
 * This is not hypothetical. Two design threads hand-assigned the number `0120` to two different
 * migrations, and the fix everybody reaches for is to hand-assign different numbers. That fix is
 * the defect: a number typed by a person comes with no journal entry. The right move is to run
 * `npm run db:generate` and take whatever number drizzle-kit assigns, because that writes the file
 * and the journal entry together. This file is what makes the wrong move fail loudly.
 *
 * ---------------------------------------------------------------------------------------
 * THREE CLAIMS, THREE `it` BLOCKS
 * ---------------------------------------------------------------------------------------
 *
 * They are separate blocks on purpose, so that a red says which one fired rather than only that
 * something about the migrations is wrong. Each one is checked against a different thing:
 *
 *   1. Every `.sql` file has a journal entry.   Files -> journal. Catches a hand-written file.
 *   2. Every journal entry has a `.sql` file.   Journal -> files. Catches a deleted or renamed
 *      file, which stops the migrator with an error that names a missing path.
 *
 * Claim 3 reads no journal deliberately. If it did, a duplicate number would also trip claim 1
 * whenever the copy lacked an entry, and a red would prove something without saying what.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT CHECK, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * It does not check that the highest number equals the number of files. An earlier version of this
 * rule did. Measured on a clean tree: 21 files and a highest tag of `0110`, because eleven of the
 * migrations were hand-numbered in tens. So that claim is red on a clean tree, which means its
 * mutation cannot be told from its control, which means it proves nothing. It is gone.
 *
 * It does not hard-code the count either. Writing `21` here would turn every future migration red
 * for the wrong reason -- the same defect in a smaller shape. Each block only insists the folder is
 * not empty, so that an unreadable or wrong path cannot pass all three by having nothing to check.
 *
 * It does not read the `.sql` contents or run anything. Whether a migration is correct SQL is
 * `tests/migration.test.ts`. This file is only about whether it runs at all.
 */

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { join } from 'node:path'

const FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url))

/** Every `.sql` file directly in `drizzle/`, sorted, without the extension -- the form a tag takes. */
function migrationFiles(): string[] {
  return readdirSync(FOLDER)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => name.slice(0, -'.sql'.length))
    .sort()
}

/** Every tag in `drizzle/meta/_journal.json`, in the order the migrator would apply them. */
function journalTags(): string[] {
  const raw = readFileSync(join(FOLDER, 'meta', '_journal.json'), 'utf8')
  const parsed = JSON.parse(raw) as { entries?: Array<{ tag?: unknown }> }
  const entries = parsed.entries
  if (!Array.isArray(entries)) {
    throw new Error('drizzle/meta/_journal.json has no "entries" array. The migrator reads that array and would apply nothing.')
  }
  return entries.map((entry, i) => {
    if (typeof entry.tag !== 'string' || entry.tag === '') {
      throw new Error(`Journal entry ${i} has no tag. The migrator resolves a tag to a file, so an entry without one names no migration.`)
    }
    return entry.tag
  })
}

/** Every entry's tag with the `when` beside it, in the order the journal lists them. */
function journalTimes(): { tag: string; when: number }[] {
  const raw = readFileSync(join(FOLDER, 'meta', '_journal.json'), 'utf8')
  const parsed = JSON.parse(raw) as { entries?: Array<{ tag?: unknown; when?: unknown }> }
  const entries = parsed.entries
  if (!Array.isArray(entries)) {
    throw new Error('drizzle/meta/_journal.json has no "entries" array. The migrator reads that array and would apply nothing.')
  }
  return entries.map((entry, i) => {
    if (typeof entry.when !== 'number') {
      throw new Error(
        `Journal entry ${String(i)} has no "when". That number is what the migrator compares against the ` +
          'newest migration a database has already applied, so an entry without one cannot be placed in time.',
      )
    }
    return { tag: typeof entry.tag === 'string' ? entry.tag : `entry ${String(i)}`, when: entry.when }
  })
}


describe('every migration in the folder is one the migrator will run', () => {
  it('every .sql file in drizzle/ has a matching tag in the journal', () => {
    const files = migrationFiles()
    const tags = new Set(journalTags())
    expect(files.length, 'no .sql files found in drizzle/ -- nothing was checked').toBeGreaterThan(0)

    const missing = files.filter((file) => !tags.has(file))
    expect(
      missing,
      missing.length === 0
        ? ''
        : `These .sql files are in drizzle/ with no entry in drizzle/meta/_journal.json, so drizzle's ` +
          `migrator will never run them: ${missing.join(', ')}. Do not add the entry by hand. Delete the ` +
          `file and run "npm run db:generate", which writes the file and its journal entry together.`,
    ).toEqual([])
  })

  it('every tag in the journal has a .sql file', () => {
    const files = new Set(migrationFiles())
    const tags = journalTags()
    expect(tags.length, 'no entries in drizzle/meta/_journal.json -- nothing was checked').toBeGreaterThan(0)

    const missing = tags.filter((tag) => !files.has(tag))
    expect(
      missing,
      missing.length === 0
        ? ''
        : `The journal names these migrations and the .sql files are not there: ${missing.join(', ')}. ` +
          `Drizzle's migrator stops on the first one it cannot open, so every migration after it is also ` +
          `left unapplied. If a migration was renamed, rename it back; the tag is the file name.`,
    ).toEqual([])
  })


  /**
   * CLAIM 4: A MIGRATION DATED BEFORE THE ONE ABOVE IT NEVER RUNS.
   *
   * ---------------------------------------------------------------------------------------
   * MEASURED, ON 4 SEPTEMBER 2026
   * ---------------------------------------------------------------------------------------
   *
   * Drizzle's migrator does not apply the journal by `idx`. It stores each applied migration's
   * `when` in the database and, on the next run, applies only the entries whose `when` is LATER
   * than the newest row it finds — `src/server/db/migrate.ts` says so in its own header.
   *
   * Two migrations on main carry hand-written `when` values a day into the future. A migration
   * generated after them takes the real clock, which is EARLIER, and drizzle then treats it as
   * already behind: it is never applied, `npm run db:migrate` reports success, and the column it
   * adds is simply not there. Nothing fails. The branch that hit this was `0130`, and what caught
   * it was a test in another file that appends a migration of its own and found it did not run —
   * a red that named neither the journal nor the time.
   *
   * SO THE ORDER `idx` READS AND THE ORDER `when` READS ARE ONE FACT IN TWO PLACES, and this is
   * the check that they cannot disagree. Regenerating is not the fix by itself: `db:generate`
   * writes the real clock, and the real clock is what went backwards.
   */
  it('every migration is dated after the one before it, which is the order the migrator applies', () => {
    const times = journalTimes()
    expect(times.length, 'no entries in drizzle/meta/_journal.json -- nothing was checked').toBeGreaterThan(0)

    // PAIRED UP IN ONE PASS rather than mapped, filtered and mapped again, because a `filter` does
    // not narrow the type of what it kept: `times[i - 1]` is possibly undefined under this project's
    // index checking, and the `before !== null` in the filter left the last `map` reading a value
    // TypeScript still called optional. Written this way there is one place the pair is made and it
    // is made only when both halves are there.
    const backwards: string[] = []
    for (let i = 1; i < times.length; i += 1) {
      const entry = times[i]
      const before = times[i - 1]
      if (entry === undefined || before === undefined) continue
      if (entry.when > before.when) continue
      backwards.push(`${entry.tag} (${String(entry.when)}) is not after ${before.tag} (${String(before.when)})`)
    }

    expect(
      backwards,
      backwards.length === 0
        ? ''
        : `These journal entries are dated on or before the entry above them: ${backwards.join('; ')}. ` +
          `Drizzle applies the entries whose "when" is later than the newest one a database has already ` +
          `run, so an entry dated backwards is skipped in silence on every database that is up to date. ` +
          `Give it a "when" later than the entry above it.`,
    ).toEqual([])
  })
})
