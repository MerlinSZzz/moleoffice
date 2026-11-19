// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT RENAMES EACH LEGACY AGENT'S DRAWN FACE TO THE KEY OF ITS NEW ID, AND THE FACE STAYS THE SAME. Migration
 * 0337, re-mint piece 3d.
 *
 * A drawn face's key is `defaultAvatarAssetId` of the participant it is drawn for, and its picture is drawn from the
 * digest of that participant (lib/avatar-drawing.ts). When the re-mint gives a legacy agent a new id, this step renames
 * the row at the drawn key of its old id to the drawn key of its new id. The row keeps, in drawn_from, the digest it was
 * drawn from, so its address sends the same bytes under the new key. Every column with a foreign key to assets.id that
 * held the old key holds the new one, and these columns are read from the schema, never from a list here. Each row
 * keeps its rowid.
 *
 * A key names an agent by its id and never by a handle, and an id is the registry's primary key, so the key names one
 * agent and no other. A row a key names is renamed only when the agent of that id is a legacy agent of the map. Uploads
 * and every other row keep their key.
 *
 * WHAT IT REFUSES, WRITING NOTHING: a row at a legacy agent's drawn key that is not a drawing, read as
 * isAnEarlierDrawnDefault in lib/avatars.ts reads one, and a row that already holds the drawn key of a legacy agent's
 * new id. Each refusal names the asset. A write that leaves a key naming no row is thrown.
 */
import type Database from 'better-sqlite3'
import { AVATAR_ASSET_KIND, GENERATED_AVATAR_LICENCE, GENERATED_AVATAR_MIME, defaultAvatarAssetId } from '@shared/participants.ts'
import { participantOfDefault, theDigestADrawingIsMadeOf } from '../avatar-drawing.ts'
import type { RemintMap } from './remint-map.ts'
import type { AKey } from './remint-write.ts'

/** The table whose rows the step renames. */
const THE_ASSETS = 'assets'

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

/** One drawn face to rename: its key now, its key under the new id, and the digest it is drawn from. */
export interface ADrawnFace {
  from: string
  to: string
  drawnFrom: string
}

/** Every column whose foreign key ties it to assets.id, read from the schema of every table. */
export function theColumnsThatHoldAnAssetsKey(db: Database.Database): AKey[] {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]
  const keys: AKey[] = []
  for (const { name } of tables) {
    const toTheAssets = db.prepare('SELECT "from" AS column, "to" AS target FROM pragma_foreign_key_list(?) WHERE "table" = ?').all(name, THE_ASSETS) as {
      column: string
      target: string | null
    }[]
    for (const key of toTheAssets) {
      // A key that names no column of assets is a key to its primary key, which is its id.
      if (key.target !== null && key.target !== 'id') throw new Error(`${name}.${key.column} has a foreign key to assets.${key.target}, which the re-mint does not rename.`)
      keys.push({ table: name, column: key.column })
    }
  }
  return keys
}

interface AnAssetsRow {
  id: string
  kind: string
  origin: string
  path: string | null
  mime: string
  bytes: number | null
  licence: string | null
  drawnFrom: string | null
}

/** A drawing this product made, by the asset row's provenance, as isAnEarlierDrawnDefault reads it. */
const isADrawing = (row: AnAssetsRow) =>
  row.kind === AVATAR_ASSET_KIND && row.origin === 'default' && row.path === null && row.bytes === null && row.mime === GENERATED_AVATAR_MIME && row.licence === GENERATED_AVATAR_LICENCE

/**
 * Each drawn face at the drawn key of a legacy agent's old id, with the key of its new id and the digest it is drawn
 * from: the one the row keeps, or else its old id's. Or every row the step cannot rename, each named.
 */
export function theDrawnFacesToRename(db: Database.Database, map: RemintMap): { faces: ADrawnFace[] } | { refused: string[] } {
  const newIdOf = new Map(map.entries.filter((entry) => entry.from === 'legacy').map((entry) => [entry.oldId, entry.newId]))
  const rows = db.prepare('SELECT id, kind, origin, path, mime, bytes, licence_source AS licence, drawn_from AS drawnFrom FROM assets ORDER BY rowid').all() as AnAssetsRow[]
  const held = db.prepare('SELECT 1 FROM assets WHERE id = ?')
  const faces: ADrawnFace[] = []
  const refused: string[] = []
  for (const row of rows) {
    const who = participantOfDefault(row.id)
    if (who === null || who.kind !== 'agent') continue
    const newId = newIdOf.get(who.id)
    if (newId === undefined) continue
    const to = defaultAvatarAssetId({ kind: 'agent', id: newId })
    if (!isADrawing(row)) refused.push(`The asset ${JSON.stringify(row.id)} has the key of the drawn face of the legacy agent ${JSON.stringify(who.id)} and is not a drawing, so the re-mint does not rename it.`)
    else if (held.get(to) !== undefined) refused.push(`The asset ${JSON.stringify(row.id)} cannot be renamed to ${JSON.stringify(to)}, the key of its agent's new id, because a row already holds that key.`)
    else faces.push({ from: row.id, to, drawnFrom: row.drawnFrom ?? theDigestADrawingIsMadeOf(who) })
  }
  return refused.length > 0 ? { refused } : { faces }
}

/**
 * RENAME EACH FACE, inside the caller's transaction: its row takes the new key and keeps the digest it is drawn from,
 * and every column that held the old key holds the new one. The keys are deferred to the commit, and checked before it.
 * Gives the number of faces renamed.
 */
export function renameTheDrawnFaces(db: Database.Database, faces: readonly ADrawnFace[]): number {
  if (!db.inTransaction) throw new Error('The drawn faces are renamed inside the re-mint transaction, and none is open.')
  const keys = faces.flatMap((face) => [face.from, face.to])
  if (new Set(keys).size !== keys.length) throw new Error('Two drawn faces to rename share a key, so the re-mint cannot tell which row a key names.')
  const holders = theColumnsThatHoldAnAssetsKey(db)
  db.pragma('defer_foreign_keys = ON')
  const theFace = db.prepare('UPDATE assets SET id = ?, drawn_from = ? WHERE id = ?')
  const theHolders = holders.map((key) => db.prepare(`UPDATE ${quoted(key.table)} SET ${quoted(key.column)} = ? WHERE ${quoted(key.column)} = ?`))
  for (const face of faces) {
    const changed = theFace.run(face.to, face.drawnFrom, face.from).changes
    if (changed !== 1) throw new Error(`The re-mint renamed ${String(changed)} assets rows with the key ${JSON.stringify(face.from)}, and expected one.`)
    for (const holder of theHolders) holder.run(face.to, face.from)
  }
  const broken = [...new Set(holders.map((key) => key.table))].flatMap((table) =>
    (db.prepare(`PRAGMA foreign_key_check(${quoted(table)})`).all() as { table: string; rowid: number | null; parent: string }[])
      .filter((row) => row.parent === THE_ASSETS)
      .map((row) => `The row ${String(row.rowid)} of ${row.table} names a row of assets that is not there.`),
  )
  if (broken.length > 0) throw new Error(`The re-mint left keys to assets that name no row, so nothing of it was kept. ${broken.join(' ')}`)
  return faces.length
}
