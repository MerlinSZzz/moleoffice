// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RESTORE PROOF RUNS ON A FRESH OFFICE, AND ITS PERSON IS THE OFFICE'S OWNER, NOBODY BUILT IN.
 *
 * `npx tsx scripts/restore-check.ts` is the destructive restore proof docs/development.md tells a
 * developer to run. It builds an office from the seed, fills the tables the seed leaves empty, exports,
 * deletes and restores. The step that fills the empty tables once acted as a person written into the
 * script, whom a fresh office does not hold, so the proof stopped at its first step with
 * "Nothing is registered as the person".
 *
 * WHAT EACH CASE RUNS. The case with both owner settings empty runs the whole proof: every one of its
 * steps, ending in "The restore is faithful." The case with a made-up owner runs only the proof's first
 * step, `--phase build`, in a scratch folder the case made, and reads the contact group that step
 * writes in the person's name. Its database is the case's own, named by MOLE_OFFICE_DB, so the phase
 * can never fall back to the checkout's live database.
 *
 * WHY tests/restore-check.test.ts DID NOT SEE IT: it runs in a test process, and
 * tests/every-test-process-is-given-the-test-offices-owner.ts makes every test office the owner's. This file runs the real command
 * in a child whose two owner settings are empty, and in one that names a made-up owner. Empty, not
 * left out: a setting left out is read from the .env the checkout holds.
 *
 * Every name here is made up.
 *
 * THE TWO CASES RUN AT ONCE. Each child works in a folder of its own with databases of its own, takes its ports from the
 * operating system as every process does, and changes no variable of this process.
 *
 * MUTATION PROOF (after a green control), in scripts/restore-check.ts: put a fixed made-up person back
 * as the one who opens the group in `fillEmptyTables`. Both cases are red: the proof stops at its
 * first step.
 *
 * WHAT IT CANNOT SEE. Some of the twenty places are not checked against the people by the product: the
 * arranger of a contact group is one, so the shortened case reads the group row itself, and the full
 * case would restore a wrong person faithfully. Those places are covered by reading the code, which
 * names the owner once, in `fillEmptyTables`, and nowhere else.
 */

import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'
import { describe, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TSX = join(REPO, 'node_modules', '.bin', 'tsx')

/** Run the restore proof with the owner settings taken out and `owner` put in, leaving this process free while it runs. */
async function theRestoreProof(owner: Record<string, string>, args: string[] = [], extra: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('MOLE_OFFICE_OWNER_')) env[key] = value
  }
  const running = promisify(execFile)(TSX, ['scripts/restore-check.ts', ...args], {
    cwd: REPO,
    env: { ...env, ...owner, ...extra },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  // Its input is closed at once, as the input it was given before was nothing.
  running.child.stdin?.end()
  try {
    return { code: 0, out: (await running).stdout }
  } catch (err) {
    // An exit code is a number; a child stopped by a signal, or one that could not start, has none.
    const e = err as { code?: number | string | null; stdout?: string; stderr?: string }
    return { code: typeof e.code === 'number' ? e.code : 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

describe.concurrent('the restore proof on a fresh office', () => {
  it('holds with both owner settings empty', async ({ expect }) => {
    const run = await theRestoreProof({ MOLE_OFFICE_OWNER_ID: '', MOLE_OFFICE_OWNER_NAME: '' })
    expect(run.out).not.toContain('Nothing is registered as the person')
    expect(run.code, run.out.slice(-4000)).toBe(0)
    expect(run.out).toContain('The restore is faithful.')
  }, 300_000)

  it('holds for a made-up owner', async ({ expect }) => {
    const scratch = mkdtempSync(join(tmpdir(), 'restore-check-owner-'))
    try {
      const database = join(scratch, 'panelx.db')
      const run = await theRestoreProof(
        { MOLE_OFFICE_OWNER_ID: 'odile-made-up', MOLE_OFFICE_OWNER_NAME: 'Odile Made-Up' },
        ['--phase', 'build', '--scratch', scratch],
        { MOLE_OFFICE_DB: database },
      )
      expect(run.out).not.toContain('Nothing is registered as the person')
      expect(run.code, run.out.slice(-4000)).toBe(0)
      const db = new Database(database, { readonly: true, fileMustExist: true })
      try {
        const row = db.prepare("SELECT count(*) AS n FROM contact_groups WHERE owner_kind = 'person' AND owner_id = ?").get('odile-made-up') as { n: number }
        expect(row.n).toBeGreaterThan(0)
      } finally {
        db.close()
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }, 300_000)
})
