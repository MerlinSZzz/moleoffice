// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0337 GIVES A DRAWN FACE THE DIGEST IT IS DRAWN FROM, AND A FACE DRAWN FROM A DIGEST IS THE FACE OF THE
 * PARTICIPANT WHOSE DIGEST IT IS.
 *
 * OLD: a face this product draws is worked out from the participant its asset key names, and from nothing else. So a key
 * renamed to an agent's new id would draw the new id's face, and the re-mint could not rename a drawn face and keep it.
 * NEW: `assets` has a `drawn_from` column. NULL, on every row written before the migration, means the face is drawn from
 * the participant its key names, as before. A drawn row may hold the 64 lowercase hex digits of a SHA-256, and its face
 * is then drawn from that digest. The database refuses anything else there, and any value on an uploaded row.
 *
 *   1. the migration only adds: `drawn_from` is the table's last column, text and nullable, and a drawn row and an
 *      uploaded row written before it read NULL, with their other columns as they were;
 *   2. the check refuses 63 and 65 characters, a capital, a character that is not a hex digit, and a value on an
 *      uploaded row, and takes 64 lowercase hex digits on a drawn row;
 *   3. a drawn row keyed for one agent, holding the digest of another, sends through the route's own function exactly
 *      the bytes a drawn row keyed for the other with NULL sends, and a NULL row sends its key's agent's drawing.
 *
 * WHAT IS REAL: a scratch office in the temporary folder, built from the real migrations up to just before 0337 and
 * then migrated with the product's own `migrateInPlace`. Every agent id and every picture row is made up, and nothing
 * reaches the live office.
 *
 * MUTATIONS, each after a control run, each file copied first and restored with cp and checked with cmp:
 *   1. in the migration, put `length(`drawn_from`) >= 63` in place of `length(`drawn_from`) = 64`: case 2 goes red;
 *   2. in the migration, delete `origin` = 'default' AND : case 2 goes red;
 *   3. in src/server/lib/avatar-drawing.ts, draw a face from its key's participant and never from `drawn_from`: case 3
 *      goes red.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { columns, journal, MIGRATIONS, migrationsBefore, partialMigrations, scratch } from './migration-fixtures.ts'

const TAG = journal(MIGRATIONS).find((entry) => entry.tag.endsWith('_a_drawn_face_keeps_what_it_is_drawn_from'))?.tag
if (TAG === undefined) throw new Error('The migration journal holds no migration ending _a_drawn_face_keeps_what_it_is_drawn_from.')
const BEFORE_0337 = migrationsBefore(TAG)
const statements = readFileSync(join(MIGRATIONS, `${TAG}.sql`), 'utf8').replace(/^\s*--.*$/gm, '')

// Made-up agents, and the made-up upload.
const DRAWN_FOR = 'made-up-agent-a'
const DIGEST_OF = 'made-up-agent-b'
const UPLOAD = 'avatar-upload-MadeUpBefore1'
const WHEN = '2026-11-12 09:00:00'

type Db = ReturnType<typeof scratch>['db']

/** One asset row, as the product's writers store a drawn one and an uploaded one, with `drawn_from` when it is given. */
async function anAsset(db: Db, id: string, drawn: boolean, drawnFrom?: string): Promise<void> {
  const { AVATAR_ASSET_KIND, GENERATED_AVATAR_LICENCE, GENERATED_AVATAR_MIME } = await import('../src/shared/participants.ts')
  const [origin, path, mime, bytes, licence] = drawn
    ? ['default', null, GENERATED_AVATAR_MIME, null, GENERATED_AVATAR_LICENCE]
    : ['uploaded', 'avatars/sha256-made-up.png', 'image/png', 12, null]
  const named = drawnFrom === undefined ? '' : ', drawn_from'
  const values = [id, AVATAR_ASSET_KIND, origin, path, mime, bytes, WHEN, null, null, licence, ...(drawnFrom === undefined ? [] : [drawnFrom])]
  db.prepare(
    `INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source${named}) VALUES (${values.map(() => '?').join(', ')})`,
  ).run(...values)
}

/** A scratch office at the migration before 0337, holding one drawn row and one uploaded row written then. */
async function beforeTheColumn() {
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  const { defaultAvatarAssetId } = await import('../src/shared/participants.ts')
  const s = scratch('drawn-from')
  migrateInPlace(s.db, partialMigrations(BEFORE_0337))
  await anAsset(s.db, defaultAvatarAssetId({ kind: 'agent', id: DRAWN_FOR }), true)
  await anAsset(s.db, UPLOAD, false)
  return s
}

/** The same office, migrated to the end. */
async function afterTheColumn() {
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  const s = await beforeTheColumn()
  const before = s.db.prepare('SELECT * FROM assets ORDER BY id').all()
  const outcome = migrateInPlace(s.db, MIGRATIONS)
  return { s, before, outcome }
}

describe('migration 0337', () => {
  it('adds drawn_from as the last column, text and nullable, and every row written before it reads NULL', async () => {
    expect(statements).toMatch(/ALTER TABLE\s+`assets`\s+ADD COLUMN\s+`drawn_from`\s+text/i)
    expect(statements).not.toMatch(/^\s*(UPDATE|DELETE|DROP)\s/im)
    const { s, before } = await afterTheColumn()
    const { defaultAvatarAssetId } = await import('../src/shared/participants.ts')
    // 0337 WAS APPLIED: the journal table holds its own row, the hash of its file and its `when`, which the scratch
    // office lacked, since it was built from a folder that ends before 0337. On 13 November 2026 this replaced a check
    // that the run applied exactly one migration, because a later migration made that count wrong.
    const { THE_MIGRATION_JOURNAL_TABLE, theMigrationsInTheFolder } = await import('../src/config/migration-look.mjs')
    const theFile = theMigrationsInTheFolder(MIGRATIONS).find((migration) => migration.tag === TAG)
    expect(theFile?.tag).toBe(TAG)
    expect(s.db.prepare(`SELECT hash, created_at FROM "${THE_MIGRATION_JOURNAL_TABLE}"`).all()).toContainEqual({ hash: theFile?.hash, created_at: theFile?.when })
    expect(columns(s.db, 'assets').at(-1)).toMatchObject({ name: 'drawn_from', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 })
    const after = s.db.prepare('SELECT * FROM assets ORDER BY id').all() as Record<string, unknown>[]
    expect(after.map((row) => row['drawn_from'])).toEqual(before.map(() => null))
    expect(before.map((row) => (row as { id: string }).id)).toEqual(expect.arrayContaining([defaultAvatarAssetId({ kind: 'agent', id: DRAWN_FOR }), UPLOAD]))
    expect(after.map(({ drawn_from: _, ...rest }) => rest)).toEqual(before)
  })

  it('refuses 63 and 65 characters, a capital, a character that is not hex and any value on an upload, and takes 64 lowercase hex on a drawing', async () => {
    const { s } = await afterTheColumn()
    const { defaultAvatarAssetId } = await import('../src/shared/participants.ts')
    const sixtyFour = 'a1'.repeat(32)
    let n = 0
    const aDrawing = (drawnFrom: string) => anAsset(s.db, defaultAvatarAssetId({ kind: 'agent', id: `made-up-agent-${String(++n)}` }), true, drawnFrom)
    const refused = /CHECK constraint failed/
    await expect(aDrawing(sixtyFour.slice(1))).rejects.toThrow(refused)
    await expect(aDrawing(`${sixtyFour}a`)).rejects.toThrow(refused)
    await expect(aDrawing(`A${sixtyFour.slice(1)}`)).rejects.toThrow(refused)
    await expect(aDrawing(`g${sixtyFour.slice(1)}`)).rejects.toThrow(refused)
    await expect(anAsset(s.db, 'avatar-upload-MadeUpAfter01', false, sixtyFour)).rejects.toThrow(refused)
    await aDrawing(sixtyFour)
    expect(s.db.prepare('SELECT drawn_from FROM assets WHERE drawn_from IS NOT NULL').pluck().all()).toEqual([sixtyFour])
  })

  it("draws a row that holds another agent's digest as that agent's face, byte for byte, and a NULL row as its key's agent's", async () => {
    const { s } = await afterTheColumn()
    const { defaultAvatarAssetId } = await import('../src/shared/participants.ts')
    const { drawDefaultAvatar, theDigestADrawingIsMadeOf, whatAnAssetRowSends } = await import('../src/server/lib/avatar-drawing.ts')
    const a = { kind: 'agent', id: DRAWN_FOR } as const
    const b = { kind: 'agent', id: DIGEST_OF } as const
    const [keyOfA, keyOfB] = [defaultAvatarAssetId(a), defaultAvatarAssetId(b)]
    s.db.prepare('UPDATE assets SET drawn_from = ? WHERE id = ?').run(theDigestADrawingIsMadeOf(b), keyOfA)
    await anAsset(s.db, keyOfB, true)
    const sends = (key: string) => whatAnAssetRowSends(s.db.prepare('SELECT * FROM assets WHERE id = ?').get(key) as Record<string, unknown>, key, s.dir)
    const [fromTheDigest, fromTheKey] = [sends(keyOfA), sends(keyOfB)]
    expect(fromTheDigest).toEqual(fromTheKey)
    expect(fromTheKey).toMatchObject({ drawing: drawDefaultAvatar(b) })
    expect(fromTheDigest).not.toMatchObject({ drawing: drawDefaultAvatar(a) })
    expect(Buffer.from(drawDefaultAvatar(a))).not.toEqual(Buffer.from(drawDefaultAvatar(b)))
  })
})
