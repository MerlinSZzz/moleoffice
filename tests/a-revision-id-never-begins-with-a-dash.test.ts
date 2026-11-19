// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVISION ID THE IMPORT WORKS OUT NEVER BEGINS WITH A DASH (decision cvQAUoJTDYbB, wave 13y round 6).
 *
 * Every id the office makes begins with a letter or a digit: an id that began with -p was read as a password, and an id
 * that begins with a dash is read as an option by a command-line tool. The import's revision ids are not drawn at
 * random. Each is the first 12 base64url characters of a hash of the record, the number and the content, so about one
 * in 32 began with a dash or an underscore. src/server/lib/hash-id.ts now replaces such a first character with a letter
 * or a digit taken from the same hash, so the same input still gives the same id.
 *
 * The import case restores many records at once and counts how many of their ids would have begun with a dash or an
 * underscore under the old rule, so a pass here is a pass on that case and not on luck.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'
import { anIdFromAHash } from '../src/server/lib/hash-id.ts'

// The first office of this process is built in a hook, so no case below pays for it (wave 13t round 34).
buildTheFirstOfficeInAHook()

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const BEGINS_WITH_A_LETTER_OR_A_DIGIT = /^[A-Za-z0-9][A-Za-z0-9_-]{11}$/

let t: TestDb | undefined
const dirs: string[] = []

afterEach(() => {
  t?.close()
  t = undefined
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A hash of 32 bytes whose first byte is `first`: 0xF8 begins base64url with a dash, 0xFC with an underscore. */
function aHashBeginningWith(first: number, seed: string): Buffer {
  const digest = createHash('sha256').update(seed).digest()
  digest[0] = first
  return digest
}

describe('an id worked out from a hash', () => {
  it('begins with a letter or a digit when the hash begins with a dash or an underscore', () => {
    for (const [first, mark] of [[0xf8, '-'], [0xfc, '_']] as const) {
      for (let n = 0; n < 50; n += 1) {
        const digest = aHashBeginningWith(first, `${mark} ${String(n)}`)
        expect(digest.toString('base64url').charAt(0)).toBe(mark)
        const id = anIdFromAHash(digest)
        expect(id).toMatch(BEGINS_WITH_A_LETTER_OR_A_DIGIT)
        // Only the first character is replaced; the other eleven are the hash's, as before.
        expect(id.slice(1)).toBe(digest.toString('base64url').slice(1, 12))
        // The same hash gives the same id.
        expect(anIdFromAHash(Buffer.from(digest))).toBe(id)
      }
    }
  })

  it('is the hash\'s own first 12 characters when they already begin with a letter or a digit', () => {
    const digest = aHashBeginningWith(0x00, 'a letter')
    expect(anIdFromAHash(digest)).toBe(digest.toString('base64url').slice(0, 12))
    expect(anIdFromAHash(digest)).toMatch(/^A/)
  })
})

describe('the revision ids an import writes when it rolls records back', () => {
  it('all begin with a letter or a digit, including those the old rule began with a dash or an underscore', async () => {
    let wouldHaveBegunWithADash = 0
    // About one id in 32 began with a dash or an underscore. A round restores 100 records, and rounds go on until at
    // least one such id has been written, at most eight of them.
    for (let round = 0; round < 8 && wouldHaveBegunWithADash === 0; round += 1) {
      t?.close()
      t = await freshDb()
      const db = t
      // Read after the test database is open, as tests/the-ledger-and-its-other-writers.test.ts does.
      const exportLib = await import('../src/server/lib/export.ts')
      const importLib = await import('../src/server/lib/import.ts')
      const notes = Array.from({ length: 100 }, (_, n) =>
        db.api.createRecord({ workspaceId: 'default', kind: 'note', title: `note ${String(n)}`, data: { body: 'yesterday' }, actor: HUMAN }),
      )
      const root = mkdtempSync(join(tmpdir(), 'mole-office-revision-ids-'))
      dirs.push(root)
      exportLib.writeExport(root)
      for (const note of notes) db.api.updateRecord(note.id, { title: `${note.title}, rewritten` }, HUMAN)

      const report = importLib.applyImport(root)
      expect(report.applied).toBe(true)
      const written = db.client.sqlite
        .prepare("SELECT id, record_id, seq, content_hash FROM revisions WHERE op = 'restore'")
        .all() as { id: string; record_id: string; seq: number; content_hash: string }[]
      expect(written).toHaveLength(notes.length)
      for (const row of written) {
        expect(row.id).toMatch(BEGINS_WITH_A_LETTER_OR_A_DIGIT)
        const digest = createHash('sha256').update(`${row.record_id}\u0000${String(row.seq)}\u0000${row.content_hash}`).digest()
        // Still worked out from the same hash of the record, the number and the content.
        expect(row.id).toBe(anIdFromAHash(digest))
        if (/^[-_]/.test(digest.toString('base64url'))) wouldHaveBegunWithADash += 1
      }
    }
    expect(wouldHaveBegunWithADash, 'no restored revision had a hash beginning with a dash or an underscore').toBeGreaterThan(0)
  }, 120_000)
})
