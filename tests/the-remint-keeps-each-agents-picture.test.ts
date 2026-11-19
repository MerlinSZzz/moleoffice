// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT KEEPS EACH AGENT'S PICTURE, AND ITS VERIFIER SAYS WHAT EACH PICTURE'S ADDRESS SENDS. Wave 13s round 168,
 * item 30c part 3: the asset interface of the plan's section 5, and its rows of the synthetic matrix.
 *
 * A throwaway office holds made-up agents and a made-up person, each wearing one of these pictures:
 *   - a drawing of a minted agent, worked out from its id;
 *   - an older drawing on a legacy agent, whose asset id names the agent's old id, so its drawing is the old id's;
 *   - an uploaded PNG, an uploaded JPEG and an uploaded WebP, each a made-up file beside the database;
 *   - a picture given at the door, whose row says so;
 *   - one upload worn by two agents, a legacy one and a minted one;
 *   - an upload whose asset id is a legacy agent's old id, worn by another agent;
 *   - an upload whose file is not there, an upload whose row names no file, and a drawing whose id names nobody, which
 *     each send nothing, for a reason of its own;
 *   - the person's upload, and the agents and people the migrations write.
 * Every picture's address is asked of the real route, GET /api/assets/:id, on that office, before the re-mint. A map is
 * staged and applied with the real command, `npm run db:migrate -- --remint <file>`, and tools/verify-the-remint.mjs is
 * asked for every check it knows. Round 257, re-mint piece 3d: the re-mint renames each legacy agent's drawn face to the
 * key of its new id, and the face keeps, in assets.drawn_from, the digest of the old id it is drawn from. Cases:
 *   1. assets passes, and the line after its own holds the manifest, before and after the re-mint: for each agent its id
 *      in the snapshot and the id the map gives it, and for each participant the asset id its row names, the address the
 *      route answered at, the asset row's other columns, and what the route sent there, by its type, how long it may be
 *      kept and the SHA-256 and length of its bytes, or that it sent nothing. After is the same as before, but for each
 *      drawn face the re-mint renames: its asset id and address are the new id's, and its drawn_from is the old id's
 *      digest. What every address sends is the same. The three that send nothing give three reasons. The legacy agent's
 *      drawing is its old id's and not its new id's, before and after. In the store after, the face is under the key of
 *      the new id with that digest, the agent wears it, and no row has the old key. Every other picture keeps its asset id
 *      and address: the minted agent's drawing, every upload, the upload whose id is a legacy agent's old id, and the
 *      drawing whose id names nobody. The two stores and the pictures are as they were;
 *   2. a fault made in a copy of the store after the re-mint fails assets and the other checks named with it, and
 *      no other, and the assets line names the participant:
 *        an agent wearing another picture fails registry;
 *        an agent no map made fails registry and registry-ids;
 *        a person wearing another picture fails rows;
 *        a changed licence on an asset row fails rows;
 *        an upload's row that says it was drawn fails rows;
 *        a renamed face whose drawn_from was changed fails rows;
 *        an agent left wearing its face's old key, which no row has, fails registry and integrity;
 *   3. in the recovery phase assets passes on a copy of the snapshot, as every check does there, and prints no manifest;
 *   4. a drawn face the re-mint cannot rename stops it, with a refusal that names the asset, and the store is as it was:
 *      a row already holds the drawn key of a legacy agent's new id, or a row at a legacy agent's drawn key is not a
 *      drawing;
 *   5. on the test's own office, re-minted after every other case, the route at the new address of each renamed face
 *      sends the same type, caching, SHA-256 and length as the old address sent before, the old address sends 404
 *      because no row has its key, and every other address sends what it sent.
 *
 * WHAT IT DOES NOT HOLD. That a file is the same after the re-mint: the check reads each file as it is when it runs, for
 * both stores. Showing the rest is for the Vault's compare of the files' manifests, which the closed upgrade is to run as
 * one of its verifiers; nothing in this checkout runs it. The picture a screen shows an agent that chose none, which is a
 * role portrait and not an asset, and how any picture looks.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-keeps-each-agents-picture.test.ts
 * After a green control, copy the file a change names, then make one of these changes:
 *   1. in remint-verification.ts, put `Buffer.from('')` in place of `Buffer.from(sent.drawing, 'utf8')`: case 1 goes red;
 *   2. in remint-verification.ts, put `Buffer.from(sent.file)` in place of `readFileSync(sent.file)`: case 1 goes red;
 *   3. in remint-verification.ts, delete `.filter(([column]) => column !== 'id')`: case 1 goes red;
 *   4. in remint-verification.ts, put `newId: agent` in place of `newId: theNewIdOf(staged.map, agent)`: case 1 goes
 *      red, and in case 2 so does the agent no map made, which the assets line no longer names among the differences it
 *      shows;
 *   5. in remint-verification.ts, delete the line `if (differ.length > 0) problems.push(`: case 2 goes red in each fault
 *      but the agent no map made;
 *   6. in remint-verification.ts, delete the line `for (const is of after) if (!was.has(keyOf(is)))`: case 2 goes red
 *      in the agent no map made;
 *   7. in verify-the-remint.mjs, delete the line `if (outcome.evidence !== undefined)`: case 1 goes red;
 *   8. in verify-the-remint.mjs, put `request.repository` in place of `request.database` in
 *      `databaseDirectoryFrom(request.database)`: no file is found, and case 1 goes red;
 *   9. in remint-verification.ts, delete `'assets', ` from THE_REMINT_CHECKS: no check is called assets, and cases 1, 2
 *      and 3 go red;
 *  10. in src/server/lib/avatar-drawing.ts, put `theDigestADrawingIsMadeOf(who)` in place of
 *      `typeof row['drawn_from'] === 'string' ? row['drawn_from'] : theDigestADrawingIsMadeOf(who)`: a renamed face is
 *      drawn from its new id, and case 1 goes red;
 *  11. in src/server/db/remint-migration.ts, put `[]` in place of `faces.faces` in `renameTheDrawnFaces(sqlite, faces.faces)`:
 *      no face is renamed, and case 1 goes red;
 *  12. in src/server/lib/registry-aliases/remint-faces.ts, put `theDigestADrawingIsMadeOf({ kind: 'agent', id: newId })`
 *      in place of `theDigestADrawingIsMadeOf(who)`: a renamed face keeps its new id's digest, and case 1 goes red on
 *      the bytes its address sends;
 *  13. in remint-faces.ts, delete the line `for (const holder of theHolders) holder.run(face.to, face.from)`: the
 *      re-mint leaves an agent wearing a key no row has, so it stops, and every case goes red;
 *  14. in remint-faces.ts, put `else if (false)` in place of `else if (held.get(to) !== undefined)`: the database refuses
 *      the second row with that key, in words that name no asset, and case 4 goes red where the key is already held;
 *  15. in remint-verification.ts, put `asset: was.asset, url: was.url` in place of
 *      `asset: face.to, url: avatarUrlFor(face.to)`: assets expects a renamed face under its old key, and case 1 goes
 *      red;
 *  16. in remint-verification.ts, delete the line `if (table === 'assets' && column === 'drawn_from')`: rows expects a
 *      renamed face's drawn_from to be NULL, and case 1 goes red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, name, picture and file here is made up, in a throwaway office. Each command is given only PATH, LANG, a
 * made-up home in the test's own folder and MOLE_OFFICE_DB, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AVATAR_ASSET_KIND,
  AVATAR_DIRECTORY,
  GENERATED_AVATAR_LICENCE,
  GENERATED_AVATAR_MIME,
  THE_PICTURE_WAS_GIVEN,
  UPLOADABLE_AVATAR_TYPES,
  avatarUrlFor,
  defaultAvatarAssetId,
  type UploadableAvatarType,
} from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { readTheStagedRemint, type StagedRemint } from '../src/server/db/remint-migration.ts'
import { THE_REMINT_CHECKS } from '../src/server/db/remint-verification.ts'
import { openImmutable } from '../tools/open-immutable.mjs'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const THE_VERIFIER = join(REPO, 'tools/verify-the-remint.mjs')
const NODE = realpathSync(process.execPath)
const CHECKS = [...THE_REMINT_CHECKS]
const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')

/** What the route sent at one address before the re-mint. */
interface Sent {
  status: number
  type: string | undefined
  keep: string | undefined
  sha256: string
  bytes: number
}

let t: TestDb
let drawDefaultAvatar: typeof import('../src/server/lib/avatars.ts').drawDefaultAvatar
let theDigestADrawingIsMadeOf: typeof import('../src/server/lib/avatar-drawing.ts').theDigestADrawingIsMadeOf
/** What the route sent, by the address it was asked at. */
const sent = new Map<string, Sent>()
let base: { snapshot: string; after: string; map: string }
beforeAll(async () => {
  t = await freshDb()
  ;({ drawDefaultAvatar } = await import('../src/server/lib/avatars.ts'))
  ;({ theDigestADrawingIsMadeOf } = await import('../src/server/lib/avatar-drawing.ts'))
  aMadeUpOfficeOfPictures(t.client.sqlite)
  // One migration with no map, so the store is as a migrated office leaves it, and the re-mint's run has nothing else to write.
  ;(await import('../src/server/db/migrate.ts')).migrateInPlace(t.client.sqlite, MIGRATIONS)
  const { app } = await apiApp()
  try {
    const worn = t.client.sqlite.prepare('SELECT avatar_asset_id AS asset FROM agents UNION SELECT avatar_asset_id FROM people').all() as { asset: string }[]
    for (const { asset } of worn) {
      const url = avatarUrlFor(asset)
      const res = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
      sent.set(url, { status: res.statusCode, type: res.headers['content-type'] as string | undefined, keep: res.headers['cache-control'] as string | undefined, sha256: sha256(res.rawPayload), bytes: res.rawPayload.length })
    }
  } finally {
    await app.close()
  }
  base = theRemint('base', (office, map) => expect(theCommand(office, '--stage-remint', map).status).toBe(0))
}, 240_000)
afterAll(() => t?.close())

const folder = () => dirname(t.file)

// THE MADE-UP AGENTS. A legacy id could be a handle; a minted one is 12 of the mint's characters, one a handle may not hold.
const MINTED_DRAWN = 'MintedDraw_1'
const MINTED_GIVEN = 'MintedGive_2'
const MINTED_SHARING = 'MintedShar_3'
const LEGACY_DRAWN = 'legacy-lark'
const LEGACY_RETIRED = 'legacy-wren'
const LEGACY_SHARING = 'legacy-robin'
const LEGACY_WEARING_AN_OLD_ID = 'legacy-finch'
const LEGACY_FILE_GONE = 'legacy-swift'
const LEGACY_NO_FILE = 'legacy-crane'
const LEGACY_DRAWN_FOR_NOBODY = 'legacy-stork'
const PERSON = 'made-up-person'
const MADE_UP = { agent: 'An agent whose id is not here', minted: 'MintedExtra1' }
// THE MADE-UP PICTURES.
const PNG = 'avatar-upload-MadeUpPng001'
const JPEG = 'avatar-upload-MadeUpJpeg01'
const WEBP = 'avatar-upload-MadeUpWebp01'
const GIVEN = 'avatar-given-MadeUpGiven1'
const GONE = 'avatar-upload-MadeUpGone01'
const NO_FILE = 'avatar-upload-MadeUpNone01'
const DRAWN_FOR_NOBODY = 'made-up-drawing'
const WHEN = '2026-10-31 03:00:00'

/** Made-up bytes that begin as a file of each type begins. No picture is drawn from them. */
const MADE_UP_BYTES: Record<UploadableAvatarType, Buffer> = {
  'image/png': Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('made-up png')]),
  'image/jpeg': Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('made-up jpeg')]),
  'image/webp': Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x14, 0, 0, 0]), Buffer.from('WEBPmade-up webp')]),
}

function aMadeUpOfficeOfPictures(s: Database.Database): void {
  const anAsset = s.prepare('INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const aDrawing = (id: string) => anAsset.run(id, AVATAR_ASSET_KIND, 'default', null, GENERATED_AVATAR_MIME, null, WHEN, null, null, GENERATED_AVATAR_LICENCE)
  /** An upload as the upload door stores one: its file under its own SHA-256, beside the database, unless `write` is false. */
  const anUpload = (id: string, mime: UploadableAvatarType, bytes: Buffer, licence: string | null = null, write = true) => {
    const path = join(AVATAR_DIRECTORY, `sha256-${sha256(bytes)}.${UPLOADABLE_AVATAR_TYPES[mime]}`)
    if (write) {
      mkdirSync(join(folder(), AVATAR_DIRECTORY), { recursive: true })
      writeFileSync(join(folder(), path), bytes)
    }
    anAsset.run(id, AVATAR_ASSET_KIND, 'uploaded', path, mime, bytes.length, WHEN, 'person', PERSON, licence)
  }
  aDrawing(defaultAvatarAssetId({ kind: 'agent', id: MINTED_DRAWN }))
  aDrawing(defaultAvatarAssetId({ kind: 'agent', id: LEGACY_DRAWN }))
  aDrawing(DRAWN_FOR_NOBODY)
  anUpload(PNG, 'image/png', MADE_UP_BYTES['image/png'])
  anUpload(JPEG, 'image/jpeg', MADE_UP_BYTES['image/jpeg'])
  anUpload(WEBP, 'image/webp', MADE_UP_BYTES['image/webp'])
  anUpload(GIVEN, 'image/png', Buffer.concat([MADE_UP_BYTES['image/png'], Buffer.from(', given')]), THE_PICTURE_WAS_GIVEN)
  anUpload(LEGACY_DRAWN, 'image/jpeg', Buffer.concat([MADE_UP_BYTES['image/jpeg'], Buffer.from(', under an old id')]))
  anUpload(GONE, 'image/png', Buffer.concat([MADE_UP_BYTES['image/png'], Buffer.from(', never written')]), null, false)
  anAsset.run(NO_FILE, AVATAR_ASSET_KIND, 'uploaded', null, 'image/png', null, WHEN, 'person', PERSON, null)

  const anAgent = (id: string, asset: string, retired = false) =>
    s.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)').run(id, `Made-up ${id}`, id.toLowerCase().replaceAll('_', '-'), asset, WHEN, retired ? 1 : 0)
  anAgent(MINTED_DRAWN, defaultAvatarAssetId({ kind: 'agent', id: MINTED_DRAWN }))
  anAgent(MINTED_GIVEN, GIVEN)
  anAgent(MINTED_SHARING, WEBP)
  anAgent(LEGACY_DRAWN, defaultAvatarAssetId({ kind: 'agent', id: LEGACY_DRAWN }))
  anAgent(LEGACY_RETIRED, PNG, true)
  anAgent(LEGACY_SHARING, WEBP)
  anAgent(LEGACY_WEARING_AN_OLD_ID, LEGACY_DRAWN)
  anAgent(LEGACY_FILE_GONE, GONE)
  anAgent(LEGACY_NO_FILE, NO_FILE)
  anAgent(LEGACY_DRAWN_FOR_NOBODY, DRAWN_FOR_NOBODY)
  s.prepare('INSERT INTO people (id, name, handle, avatar_asset_id, created_at) VALUES (?, ?, ?, ?, ?)').run(PERSON, 'A made-up person', PERSON, JPEG, WHEN)
}

interface Ran {
  status: number | null
  stdout: string
  stderr: string
}
function ran(program: string, args: string[], cwd: string, database: string): Ran {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const it = spawnSync(program, args, { cwd, env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: database }, encoding: 'utf8' })
  if (it.error !== undefined) throw it.error
  return { status: it.status, stdout: it.stdout, stderr: it.stderr }
}
/** THE REAL COMMAND, `npm run db:migrate -- <args>`, on `database`. */
const theCommand = (database: string, ...args: string[]) => ran(process.execPath, ['--import', 'tsx', 'src/server/db/migrate.ts', ...args], REPO, database)

/** The journal, log and shared-memory files beside a database. */
const theFilesBeside = (file: string) => ['-journal', '-wal', '-shm'].filter((suffix) => existsSync(file + suffix))

/**
 * A RE-MINT OF A COPY OF THE MADE-UP OFFICE, in a folder of its own: `stage` writes the map, the snapshot is a byte copy
 * of the store just before the re-mint, and the real command applies the map.
 */
function theRemint(name: string, stage: (office: string, map: string) => void): { snapshot: string; after: string; map: string } {
  const at = join(folder(), name)
  mkdirSync(at)
  const [after, snapshot, map] = [join(at, 'office.db'), join(at, 'snapshot.db'), join(at, 'map.json')]
  t.client.sqlite.prepare('VACUUM INTO ?').run(after)
  stage(after, map)
  copyFileSync(after, snapshot)
  const applied = theCommand(after, '--remint', map)
  expect(applied.status, applied.stderr).toBe(0)
  expect(theFilesBeside(after)).toEqual([])
  return { snapshot, after, map }
}

interface ACase {
  at: string
  snapshot: string
  after: string
  map: string
}
/** A folder of its own for one case, with copies of the base snapshot, store after and map, and the pictures beside them. */
let cases = 0
function aCase(after = base.after): ACase {
  const at = join(folder(), `case-${String(++cases)}`)
  mkdirSync(at)
  const copy = (file: string, as: string) => {
    copyFileSync(file, join(at, as))
    return join(at, as)
  }
  cpSync(join(folder(), AVATAR_DIRECTORY), join(at, AVATAR_DIRECTORY), { recursive: true })
  return { at, snapshot: copy(base.snapshot, 'snapshot.db'), after: copy(after, 'office.db'), map: copy(base.map, 'map.json') }
}

/** A made-up fault, made with a handle on a copy of the store after the re-mint, which it closes. */
function aFault(file: string, fault: (s: Database.Database) => void): void {
  const s = new Database(file)
  try {
    fault(s)
  } finally {
    s.close()
  }
  expect(theFilesBeside(file)).toEqual([])
}

const COMMIT = 'a'.repeat(40)
const STATE = 'b'.repeat(64)
interface Verified extends Ran {
  result: string
}
/** THE VERIFIER on one request for every check it knows, run from an empty folder, with MOLE_OFFICE_DB naming a file in it. */
function verified(c: ACase, phase: 'target' | 'recovery'): Verified {
  const n = readdirSync(c.at).filter((name) => name.startsWith('request-')).length + 1
  const [request, result] = [join(c.at, `request-${String(n)}.json`), join(c.at, `result-${String(n)}.json`)]
  writeFileSync(request, JSON.stringify({ version: 1, phase, commit: COMMIT, repository: REPO, database: c.after, snapshot: c.snapshot, servicePort: 1, checks: CHECKS, stateSha256: STATE }))
  const empty = join(c.at, `empty-${String(n)}`)
  mkdirSync(empty)
  const it = ran(NODE, [THE_VERIFIER, '--within', '60000', '--map', c.map, request, result], empty, join(empty, 'office.db'))
  expect(readdirSync(empty), 'MOLE_OFFICE_DB names a file the verifier never makes').toEqual([])
  return { ...it, result }
}
const failedIn = (it: Verified) =>
  Object.entries((JSON.parse(readFileSync(it.result, 'utf8')) as { checks: Record<string, boolean> }).checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)

/** One participant's picture, as the verifier prints it. */
interface APicture {
  kind: string
  oldId: string | null
  newId: string
  asset: string
  url: string
  provenance: Record<string, unknown> | null
  sent: { from: string; mime: string; cacheControl: string; sha256: string; bytes: number } | { refused: string }
}
/** The manifest on the line after assets's own. */
function theManifest(it: Verified): { before: APicture[]; after: APicture[] } {
  const found = /^assets: passed in \d+ ms\. [^\n]*\nassets read, as JSON: ([^\n]*)$/m.exec(it.stdout)
  expect(found, it.stdout + it.stderr).not.toBeNull()
  return JSON.parse(found![1]!) as { before: APicture[]; after: APicture[] }
}

/** Every file a case holds, by its name, with its SHA-256. */
function theFilesOf(c: ACase): Record<string, string> {
  const pictures = join(c.at, AVATAR_DIRECTORY)
  return {
    snapshot: sha256(readFileSync(c.snapshot)),
    after: sha256(readFileSync(c.after)),
    ...Object.fromEntries(readdirSync(pictures).map((name) => [name, sha256(readFileSync(join(pictures, name)))])),
  }
}

/** The id the base map gives an agent of the made-up office. */
const newIdOf = (agent: string) => readTheStagedRemint(base.map).map.entries.find((entry) => entry.oldId === agent)!.newId
/** The key of the drawing of the agent with this id. */
const drawnKeyOf = (id: string) => defaultAvatarAssetId({ kind: 'agent', id })

/** A drawn face the re-mint is to rename, as this test works it out: the legacy agent it is drawn for, and its key after. */
interface AFaceToRename {
  agent: string
  to: string
}
/** Each legacy agent of the map whose drawn key has a row in `db`, by that key. */
function theFacesToRename(db: Database.Database, staged: StagedRemint): Map<string, AFaceToRename> {
  const held = db.prepare('SELECT 1 FROM assets WHERE id = ?')
  return new Map(
    staged.map.entries
      .filter((entry) => entry.from === 'legacy' && held.get(drawnKeyOf(entry.oldId)) !== undefined)
      .map((entry) => [drawnKeyOf(entry.oldId), { agent: entry.oldId, to: drawnKeyOf(entry.newId) }]),
  )
}
/** A picture of the manifest before, as it is to be after: a renamed face under its new key, drawn from its old id. */
function asRenamed(one: APicture, faces: Map<string, AFaceToRename>): APicture {
  const face = faces.get(one.asset)
  if (face === undefined) return one
  return { ...one, asset: face.to, url: avatarUrlFor(face.to), provenance: { ...one.provenance, drawn_from: theDigestADrawingIsMadeOf({ kind: 'agent', id: face.agent }) } }
}

describe('a sound re-mint', () => {
  it("passes assets, and prints each picture's manifest with what the route sent at its address, the same after but each drawn face it renames", () => {
    const c = aCase()
    const before = theFilesOf(c)
    const it = verified(c, 'target')
    expect(it.status, it.stdout + it.stderr).toBe(0)
    expect(failedIn(it)).toEqual([])
    const manifest = theManifest(it)

    const staged = readTheStagedRemint(c.map)
    // Opened as the verifier opens it, so the test's own read leaves nothing beside the snapshot.
    const opened = openImmutable(Database, 'snapshot', c.snapshot)
    if (!('db' in opened)) throw new Error(`The snapshot could not be opened: ${opened.why}`)
    const snapshot = opened.db as Database.Database
    let faces = new Map<string, AFaceToRename>()
    try {
      faces = theFacesToRename(snapshot, staged)
      const worn = (table: string) => snapshot.prepare(`SELECT id, avatar_asset_id AS asset FROM ${table}`).all() as { id: string; asset: string }[]
      const ids = (pictures: APicture[], kind: string) => pictures.filter((one) => one.kind === kind).map((one) => [one.oldId, one.newId, one.asset]).sort()
      expect(ids(manifest.before, 'agent')).toEqual(worn('agents').map((one) => [one.id, staged.map.entries.find((entry) => entry.oldId === one.id)!.newId, one.asset]).sort())
      expect(ids(manifest.before, 'person')).toEqual(worn('people').map((one) => [one.id, one.id, one.asset]).sort())
      for (const one of manifest.before) {
        const route = sent.get(one.url)
        expect(route, `${one.asset}: the route was asked at the address the manifest gives`).toBeDefined()
        const { id, ...provenance } = snapshot.prepare('SELECT * FROM assets WHERE id = ?').get(one.asset) as Record<string, unknown>
        expect(id).toBe(one.asset)
        expect(one.provenance, `${one.asset}: the asset row's other columns`).toEqual(provenance)
        if (route!.status === 200) {
          const from = route!.type === GENERATED_AVATAR_MIME ? 'drawing' : 'file'
          expect(one.sent, `${one.asset}: what the route sent`).toEqual({ from, mime: route!.type, cacheControl: route!.keep, sha256: route!.sha256, bytes: route!.bytes })
        } else expect(one.sent, `${one.asset}: the route sent nothing, with ${String(route!.status)}`).toEqual({ refused: expect.any(String) as string })
      }
    } finally {
      snapshot.close()
    }

    // After the re-mint each drawn face it renames has the asset id and address of the new id, and every other picture
    // the ones it had. The rest of each picture is as it was, but the digest a renamed face is drawn from: its old id's.
    expect([...faces.values()].map((face) => face.agent)).toContain(LEGACY_DRAWN)
    const renamedTo = (one: APicture) => faces.get(one.asset)?.to ?? one.asset
    expect(manifest.after.map((one) => [one.kind, one.newId, one.asset, one.url])).toEqual(manifest.before.map((one) => [one.kind, one.newId, renamedTo(one), avatarUrlFor(renamedTo(one))]))
    expect(manifest.after).toEqual(manifest.before.map((one) => asRenamed(one, faces)))

    // The rows of the matrix: each kind of picture is there and sends what it should.
    const of = (agent: string, pictures = manifest.before) => pictures.find((one) => one.oldId === agent)!
    for (const [agent, from] of [[MINTED_DRAWN, 'drawing'], [LEGACY_DRAWN, 'drawing'], [LEGACY_RETIRED, 'file'], [MINTED_GIVEN, 'file'], [LEGACY_SHARING, 'file'], [MINTED_SHARING, 'file'], [LEGACY_WEARING_AN_OLD_ID, 'file']] as const) {
      expect(of(agent).sent, agent).toMatchObject({ from })
    }
    expect(of(LEGACY_SHARING).sent).toEqual(of(MINTED_SHARING).sent)
    expect(of(LEGACY_WEARING_AN_OLD_ID).asset).toBe(LEGACY_DRAWN)
    expect(manifest.before.find((one) => one.newId === PERSON)!.sent).toMatchObject({ from: 'file', mime: 'image/jpeg' })
    const refusals = [LEGACY_FILE_GONE, LEGACY_NO_FILE, LEGACY_DRAWN_FOR_NOBODY].map((agent) => of(agent).sent)
    expect(new Set(refusals.map((one) => ('refused' in one ? one.refused : null))).size, JSON.stringify(refusals)).toBe(3)
    // The legacy agent's drawing is drawn from its old id, which its asset id names before the re-mint and its drawn_from
    // after it, and not from the id the map gives it.
    const drawn = of(LEGACY_DRAWN)
    const drawnAfter = of(LEGACY_DRAWN, manifest.after)
    expect(drawn.newId).not.toBe(LEGACY_DRAWN)
    expect([drawn.asset, drawnAfter.asset]).toEqual([drawnKeyOf(LEGACY_DRAWN), drawnKeyOf(drawn.newId)])
    for (const one of [drawn, drawnAfter]) {
      expect(one.sent).toMatchObject({ sha256: sha256(drawDefaultAvatar({ kind: 'agent', id: LEGACY_DRAWN })) })
      expect(one.sent).not.toMatchObject({ sha256: sha256(drawDefaultAvatar({ kind: 'agent', id: drawn.newId })) })
    }
    // Every other picture keeps its asset id and address: the minted agent's drawing, every upload, the upload whose id is
    // a legacy agent's old id, and the drawing whose id names nobody.
    const person = (pictures: APicture[]) => pictures.find((one) => one.newId === PERSON)!
    const kept = [MINTED_DRAWN, MINTED_GIVEN, MINTED_SHARING, LEGACY_RETIRED, LEGACY_SHARING, LEGACY_WEARING_AN_OLD_ID, LEGACY_FILE_GONE, LEGACY_NO_FILE, LEGACY_DRAWN_FOR_NOBODY]
    for (const [was, is] of [...kept.map((agent) => [of(agent), of(agent, manifest.after)]), [person(manifest.before), person(manifest.after)]]) {
      expect([is!.asset, is!.url], is!.newId).toEqual([was!.asset, was!.url])
    }

    // In the store after, the face is under the key of the new id with its old id's digest, the agent wears it, no row
    // has a renamed face's old key, and no other row holds a drawn_from.
    const read = openImmutable(Database, 'after', c.after)
    if (!('db' in read)) throw new Error(`The store after could not be opened: ${read.why}`)
    const after = read.db as Database.Database
    try {
      expect(after.prepare('SELECT drawn_from FROM assets WHERE id = ?').pluck().get(drawnKeyOf(drawn.newId))).toBe(theDigestADrawingIsMadeOf({ kind: 'agent', id: LEGACY_DRAWN }))
      expect(after.prepare('SELECT avatar_asset_id FROM agents WHERE id = ?').pluck().get(drawn.newId)).toBe(drawnKeyOf(drawn.newId))
      const old = [...faces.keys()]
      expect(after.prepare(`SELECT count(*) FROM assets WHERE id IN (${old.map(() => '?').join(', ')})`).pluck().get(...old)).toBe(0)
      expect(after.prepare('SELECT id FROM assets WHERE drawn_from IS NOT NULL ORDER BY id').pluck().all()).toEqual([...faces.values()].map((face) => face.to).sort())
    } finally {
      after.close()
    }

    expect(theFilesOf(c)).toEqual(before)
    expect([...theFilesBeside(c.snapshot), ...theFilesBeside(c.after)]).toEqual([])
  })
})

describe('a fault in the store after the re-mint', () => {
  const FAULTS: [string, (s: Database.Database) => void, string, string[]][] = [
    ['an agent wearing another picture', (s) => s.prepare('UPDATE agents SET avatar_asset_id = ? WHERE id = ?').run(PNG, MINTED_DRAWN), MINTED_DRAWN, ['registry']],
    [
      'an agent no map made',
      (s) => s.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, 0)').run(MADE_UP.minted, MADE_UP.agent, 'made-up-extra', PNG, WHEN),
      MADE_UP.minted,
      ['registry', 'registry-ids'],
    ],
    ['a person wearing another picture', (s) => s.prepare('UPDATE people SET avatar_asset_id = ? WHERE id = ?').run(PNG, PERSON), PERSON, ['rows']],
    ['a changed licence on an asset row', (s) => s.prepare("UPDATE assets SET licence_source = 'A made-up licence' WHERE id = ?").run(GIVEN), MINTED_GIVEN, ['rows']],
    ["an upload's row that says it was drawn", (s) => s.prepare("UPDATE assets SET origin = 'default' WHERE id = ?").run(WEBP), MINTED_SHARING, ['rows']],
    [
      "a renamed face whose drawn_from was changed",
      (s) => s.prepare('UPDATE assets SET drawn_from = ? WHERE id = ?').run(sha256('a made-up face'), drawnKeyOf(newIdOf(LEGACY_DRAWN))),
      LEGACY_DRAWN,
      ['rows'],
    ],
    [
      "an agent left wearing its face's old key",
      (s) => {
        // The key no row has is the fault, so the store's own refusal of it is turned off for this one write.
        s.pragma('foreign_keys = OFF')
        s.prepare('UPDATE agents SET avatar_asset_id = ? WHERE id = ?').run(drawnKeyOf(LEGACY_DRAWN), newIdOf(LEGACY_DRAWN))
      },
      LEGACY_DRAWN,
      ['registry', 'integrity'],
    ],
  ]
  for (const [name, fault, named, alsoFailing] of FAULTS) {
    it(`${name} fails assets and ${alsoFailing.join(', ')}, and no other check`, () => {
      const c = aCase()
      aFault(c.after, fault)
      const it = verified(c, 'target')
      expect(it.status, it.stdout + it.stderr).toBe(1)
      expect(failedIn(it).sort()).toEqual(['assets', ...alsoFailing].sort())
      expect(it.stdout).toMatch(new RegExp(`^assets: FAILED in \\d+ ms\\. [^\\n]*${JSON.stringify(named)}`, 'm'))
    })
  }
})

describe('the recovery phase', () => {
  it('passes assets on a copy of the snapshot, as every check, and prints no manifest', () => {
    const c = aCase(base.snapshot)
    const it = verified(c, 'recovery')
    expect(it.status, it.stdout + it.stderr).toBe(0)
    expect(failedIn(it)).toEqual([])
    expect(it.stdout).toMatch(/^assets: passed in \d+ ms\. After a rollback /m)
    expect(it.stdout).not.toContain('assets read, as JSON')
  })
})

/** Every row of every table but a virtual one, by the table. */
function theRowsOf(file: string): Record<string, unknown[]> {
  const s = new Database(file, { fileMustExist: true })
  try {
    const tables = s.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND sql NOT LIKE 'CREATE VIRTUAL TABLE%' ORDER BY name").pluck().all() as string[]
    return Object.fromEntries(tables.map((table) => [table, s.prepare(`SELECT * FROM "${table.replaceAll('"', '""')}"`).all()]))
  } finally {
    s.close()
  }
}

describe('a drawn face the re-mint cannot rename', () => {
  /** Each fault, made in a copy of the snapshot before the re-mint, and the asset key its refusal is to name. */
  const REFUSALS: [string, (s: Database.Database) => string][] = [
    [
      "a row already holds the drawn key of a legacy agent's new id",
      (s) => {
        const taken = drawnKeyOf(newIdOf(LEGACY_DRAWN))
        s.prepare("INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, licence_source) VALUES (?, ?, 'default', NULL, ?, NULL, ?, ?)").run(taken, AVATAR_ASSET_KIND, GENERATED_AVATAR_MIME, WHEN, GENERATED_AVATAR_LICENCE)
        return taken
      },
    ],
    [
      "a row at a legacy agent's drawn key that is not a drawing",
      (s) => {
        const notDrawn = drawnKeyOf(LEGACY_RETIRED)
        s.prepare("INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id) VALUES (?, ?, 'uploaded', ?, 'image/png', ?, ?, 'person', ?)").run(notDrawn, AVATAR_ASSET_KIND, join(AVATAR_DIRECTORY, 'sha256-made-up.png'), 12, WHEN, PERSON)
        return notDrawn
      },
    ],
  ]
  let refused = 0
  for (const [name, fault] of REFUSALS) {
    it(`${name} stops the re-mint, which names the asset and leaves the store as it was`, () => {
      expect(readTheStagedRemint(base.map).map.entries.filter((entry) => entry.from === 'legacy').map((entry) => entry.oldId)).toEqual(expect.arrayContaining([LEGACY_DRAWN, LEGACY_RETIRED]))
      const at = join(folder(), `refused-${String(++refused)}`)
      mkdirSync(at)
      const office = join(at, 'office.db')
      copyFileSync(base.snapshot, office)
      let named = ''
      aFault(office, (s) => {
        named = fault(s)
      })
      const before = theRowsOf(office)
      const applied = theCommand(office, '--remint', base.map)
      expect(applied.status, applied.stdout + applied.stderr).toBe(1)
      expect(applied.stderr).toContain(JSON.stringify(named))
      expect(theRowsOf(office)).toEqual(before)
    })
  }
})

// LAST, because it re-mints the test's own office, which every case above copies from.
describe('the route, asked again on the same office after the re-mint', () => {
  it('sends at the new address of each renamed face what its old address sent, nothing at the old one, and at every other address what it sent', async () => {
    const at = join(folder(), 'the-same-office')
    mkdirSync(at)
    const map = join(at, 'map.json')
    const staging = theCommand(t.file, '--stage-remint', map)
    expect(staging.status, staging.stdout + staging.stderr).toBe(0)
    const faces = theFacesToRename(t.client.sqlite, readTheStagedRemint(map))
    expect([...faces.values()].map((face) => face.agent)).toContain(LEGACY_DRAWN)
    const applied = theCommand(t.file, '--remint', map)
    expect(applied.status, applied.stdout + applied.stderr).toBe(0)

    const renamedAt = new Map([...faces].map(([from, face]) => [avatarUrlFor(from), face]))
    expect([...renamedAt.keys()].filter((url) => sent.has(url))).toContain(avatarUrlFor(drawnKeyOf(LEGACY_DRAWN)))
    const { app } = await apiApp()
    try {
      const asked = async (url: string): Promise<Sent> => {
        const res = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
        return { status: res.statusCode, type: res.headers['content-type'] as string | undefined, keep: res.headers['cache-control'] as string | undefined, sha256: sha256(res.rawPayload), bytes: res.rawPayload.length }
      }
      for (const [url, was] of sent) {
        const face = renamedAt.get(url)
        if (face === undefined) {
          expect(await asked(url), url).toEqual(was)
          continue
        }
        expect(was.status, url).toBe(200)
        expect(await asked(avatarUrlFor(face.to)), avatarUrlFor(face.to)).toEqual(was)
        expect((await asked(url)).status, url).toBe(404)
        expect(t.client.sqlite.prepare('SELECT count(*) FROM assets WHERE id = ?').pluck().get(drawnKeyOf(face.agent)), url).toBe(0)
      }
    } finally {
      await app.close()
    }
  }, 120_000)
})
