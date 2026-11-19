// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT GIVEN THE DEFAULT PICTURE POINTS AT THE ONE STORED COPY, rather than getting a copy of its own.
 *
 * The secretary's decision OGmvMN3xm7We, wave 13y round 30, way 1 of item 3.4: "an agent given the default picture points at
 * the one stored picture instead of getting its own copy. One stored file, one fetch per browser, and nothing about how
 * it looks changes." Until this round `giveTheOfferedPicture` stored the bee again for every agent it was given to. On
 * the copy of the office made on 5 October 2026 that was 950 copies of the same 368,618 bytes, 350 MB in all, and a
 * browser fetched each one separately, because each has its own address served immutable for a year.
 *
 * THE COPIES AGENTS ALREADY HOLD STAY AS THEY ARE: the same decision says no existing row changes. So the case that
 * starts with two old copies checks that their agents still point at them.
 *
 * THE NEWEST COPY IS THE ONE SHARED. Any copy holding the bee's bytes would draw the same, but if the bee is ever
 * redrawn, every older copy stops matching, and an oldest-first search would read them all at each registration:
 * 950 files and 350 MB in the owner's office.
 *
 * A COPY IS SHARED ONLY WHILE IT IS THE PICTURE ON OFFER. Its file must be there and hold the bee's bytes as they are
 * now. A database copied away from its pictures has rows whose files are gone, and the bee is a drawing somebody may
 * edit; in both cases an agent pointed at the old row would be drawn something other than what it was offered.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { moleOffice, THE_PICTURE_WAS_GIVEN, avatarUrlFor, defaultAvatarAssetId, type ParticipantRef } from '../src/shared/participants.ts'

type AvatarLib = typeof import('../src/server/lib/avatars.ts')

let t: TestDb
let avatars: AvatarLib
let compressAvatar: typeof import('../src/server/lib/avatar-compression.ts').compressAvatar

/** The registry rows and stored pictures this case made, taken away at its end. */
const madeAgentIds: string[] = []
const madeAssetIds: string[] = []

beforeAll(async () => {
  t = await freshDb()
  avatars = await import('../src/server/lib/avatars.ts')
  // freshDb resets modules; use the codec bound to that world's installed probe.
  compressAvatar = (await import('../src/server/lib/avatar-compression.ts')).compressAvatar
}, 60_000)

afterAll(() => {
  t.close()
})

afterEach(() => {
  const removedPaths: string[] = []
  const marks = (count: number): string => Array.from({ length: count }, () => '?').join(', ')
  if (madeAgentIds.length > 0) {
    const which = `(${marks(madeAgentIds.length)})`
    t.client.sqlite.prepare(`DELETE FROM agent_records WHERE agent_id IN ${which}`).run(...madeAgentIds)
    t.client.sqlite.prepare(`DELETE FROM handle_holds WHERE agent_id IN ${which}`).run(...madeAgentIds)
    t.client.sqlite.prepare(`DELETE FROM agents WHERE id IN ${which}`).run(...madeAgentIds)
  }
  for (const id of [...new Set(madeAssetIds)]) {
    const row = t.client.sqlite.prepare('SELECT path FROM assets WHERE id = ?').get(id) as { path: string | null } | undefined
    if (row?.path) removedPaths.push(row.path)
    if (row?.path) rmSync(join(join(t.file, '..'), row.path), { force: true })
    t.client.sqlite.prepare('DELETE FROM assets WHERE id = ?').run(id)
  }
  // This fixture removes the uploads it made between cases. Their immutable descriptions belong
  // to the same fixture; retaining a description after deleting its blob would invent corruption.
  if (existsSync(avatars.avatarDirectory())) for (const name of readdirSync(avatars.avatarDirectory()).filter(name=>name.endsWith('.json'))) {
    const manifest=join(avatars.avatarDirectory(),name)
    if (removedPaths.includes((JSON.parse(readFileSync(manifest,'utf8')) as {path:string}).path)) rmSync(manifest)
  }
  madeAgentIds.length = 0
  madeAssetIds.length = 0
})

/** Register an agent the way the records door does, with no picture chosen. Answers its registry row. */
function register(handle: string): { id: string; asset: string } {
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: `Agent ${handle}`,
    data: { handle, runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })
  const row = t.client.sqlite.prepare('SELECT id, avatar_asset_id AS asset FROM agents WHERE handle = ?').get(handle) as
    | { id: string; asset: string }
    | undefined
  expect(row, `${handle} did not register`).toBeDefined()
  madeAgentIds.push(row!.id)
  madeAssetIds.push(row!.asset)
  return row!
}

/** The bee's bytes as this checkout offers them. */
function theBee(): Buffer {
  const found = avatars.offeredAvatarBytes(avatars.THE_DEFAULT_PICTURE.set, avatars.THE_DEFAULT_PICTURE.name)
  expect(typeof found.body, 'this checkout offers no bee, so nothing here is measured').not.toBe('string')
  return found.body as Buffer
}

/** The stored file behind one asset row, by the path the row names. */
function fileOf(asset: string): string {
  const row = t.client.sqlite.prepare('SELECT path FROM assets WHERE id = ?').get(asset) as { path: string } | undefined
  expect(row, `asset ${asset} has no row`).toBeDefined()
  return join(join(t.file, '..'), row!.path)
}

/** Every stored picture file that holds the bee's bytes. */
function storedBees(): string[] {
  const bee = theBee()
  const compressed = compressAvatar(bee, 'image/png').bytes
  const rows = t.client.sqlite.prepare("SELECT id, path FROM assets WHERE origin = 'uploaded'").all() as { id: string; path: string }[]
  return rows.filter((row) => {
    const file = join(join(t.file, '..'), row.path)
    return existsSync(file) && (readFileSync(file).equals(bee) || readFileSync(file).equals(compressed))
  }).map((row) => row.id)
}

/** A copy of the bee stored and marked given the way every copy before this round was. */
function anOldCopy(bytes: Buffer = theBee()): string {
  // Build the legacy state itself: the new upload door is allowed to share, so calling it twice
  // would no longer make two historical rows and files.
  const id = `legacy-given-${String(madeAssetIds.length)}`
  const path = join('avatars', `${id}.png`)
  mkdirSync(avatars.avatarDirectory(), { recursive: true })
  writeFileSync(join(join(t.file, '..'), path), bytes)
  const by = moleOffice()
  t.client.sqlite.prepare(
    "INSERT INTO assets (id,kind,origin,path,mime,bytes,created_at,created_by_kind,created_by_id,licence_source) VALUES (?,'avatar','uploaded',?,'image/png',?,CURRENT_TIMESTAMP,?,?,?)",
  ).run(id, path, bytes.length, by.kind, by.id, THE_PICTURE_WAS_GIVEN)
  madeAssetIds.push(id)
  return id
}

const agent = (id: string): ParticipantRef => ({ kind: 'agent', id })

describe('agents given the default picture share one stored copy', () => {
  it('two new agents point at one stored picture, and it is the bee', () => {
    const one = register('shares-one')
    const two = register('shares-two')
    // THE CONTROL: each was given a stored picture, not left on the drawing.
    expect(one.asset).not.toBe(defaultAvatarAssetId(agent(one.id)))
    expect(two.asset).not.toBe(defaultAvatarAssetId(agent(two.id)))
    // ONE STORED PICTURE, which both rows name.
    expect(two.asset).toBe(one.asset)
    expect(storedBees()).toEqual([one.asset])
    expect(readFileSync(fileOf(one.asset))).toEqual(compressAvatar(theBee(), 'image/png').bytes)
    // AND IT STILL SAYS IT WAS GIVEN, so the card's portrait is still drawn in its place (criterion M75).
    const licence = t.client.sqlite.prepare('SELECT licence_source AS licence FROM assets WHERE id = ?').get(one.asset) as { licence: string }
    expect(licence.licence).toBe(THE_PICTURE_WAS_GIVEN)
  })

  it('draws both at one address, so a browser fetches the picture once', () => {
    const one = register('drawn-one')
    const two = register('drawn-two')
    const onOffer = avatars.avatarsOnOffer()
    const first = avatars.pictureShownFor(agent(one.id), one.asset, onOffer)
    expect(first).toBe(avatarUrlFor(one.asset))
    expect(avatars.pictureShownFor(agent(two.id), two.asset, onOffer)).toBe(first)
  })

  it('new agents point at the newest copy already stored, and the agents holding copies keep them', () => {
    // TWO COPIES FROM BEFORE THIS ROUND, stamped as the first and the last of the owner's office's copies were.
    const older = anOldCopy()
    const newer = anOldCopy()
    const stamp = t.client.sqlite.prepare('UPDATE assets SET created_at = ? WHERE id = ?')
    stamp.run('2026-09-07 19:05:18', older)
    stamp.run('2026-10-05 14:26:35', newer)
    const before = storedBees().length
    const fresh = register('after-the-old-copies')
    const next = register('after-the-old-copies-too')
    expect(fresh.asset).toBe(newer)
    expect(next.asset).toBe(newer)
    // NOTHING WAS STORED, and both old rows and their files are as they were.
    expect(storedBees()).toHaveLength(before)
    for (const id of [older, newer]) expect(readFileSync(fileOf(id)).equals(theBee()), `${id} changed`).toBe(true)
  })

  it('does not share a copy whose file is gone or whose bytes are not the bee as it is now', () => {
    const gone = anOldCopy()
    // THE FILE IS GONE: removed from the folder, as on a database copied away from its pictures.
    rmSync(fileOf(gone))
    // AND AN OLDER DRAWING OF THE BEE, the same length with other bytes.
    const bee = theBee()
    const edited = Buffer.from(bee)
    edited[edited.length - 20] = edited[edited.length - 20]! ^ 0xff
    const old = anOldCopy(edited)
    const fresh = register('not-the-old-ones')
    expect(fresh.asset).not.toBe(gone)
    expect(fresh.asset).not.toBe(old)
    expect(readFileSync(fileOf(fresh.asset))).toEqual(compressAvatar(bee, 'image/png').bytes)
    // AND THE NEXT ONE SHARES THE COPY JUST STORED.
    expect(register('shares-the-new-one').asset).toBe(fresh.asset)
  })

  it('does not share a copy of the bee that somebody chose, because that row does not say it was given', () => {
    // A PERSON PRESSED THE BEE FOR AN AGENT: the picker's upload, which stores the bytes and marks nothing.
    const chosen = avatars.storeUploadedAvatar(theBee(), { kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
    madeAssetIds.push(chosen)
    const fresh = register('beside-a-chosen-bee')
    expect(fresh.asset).not.toBe(chosen)
    const licence = t.client.sqlite.prepare('SELECT licence_source AS licence FROM assets WHERE id = ?').get(fresh.asset) as { licence: string | null }
    expect(licence.licence, 'the agent points at a row that does not say it was given').toBe(THE_PICTURE_WAS_GIVEN)
  })

  it('stores one file in the avatar folder for any number of agents', () => {
    const folder = avatars.avatarDirectory()
    const count = (): number => (existsSync(folder) ? readdirSync(folder).length : 0)
    register('folder-one')
    const after = count()
    for (const handle of ['folder-two', 'folder-three', 'folder-four']) register(handle)
    expect(count()).toBe(after)
  })
})
