// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORLD'S COPY CARRIES NONE OF THE OFFICE'S KEY HASHES. Criterion P84, the copy-time half.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS MEASURES, WALKED
 * ---------------------------------------------------------------------------------------
 *
 * A world's database is made by one `VACUUM INTO` in tools/isolated-mole-office.mjs — `copyDatabase`
 * — which copies EVERY table, `held_keys` included. `held_keys` holds the SHA-256 of every agent
 * key the office ever made and every person's-device key, and it has no world column. So a device
 * the person paired, or had already ENDED, proved the person inside every world copied while its
 * row was live, with no way to take it back from inside the world. Problem `FmGa9AOxfaw1`.
 *
 * The proof-time half (tests/a-world-trusts-two-keys-and-no-others.test.ts) narrows a world that
 * still holds the rows to the starter's key and the secretary's key. This is the other half: the
 * copy is emptied of the rows themselves, so a world made from now on has no copied key to trust
 * whatever any later gate says. The two together leave no gap.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, EACH BY DRIVING SOMETHING
 * ---------------------------------------------------------------------------------------
 *
 *   · a copy made by the tool's own `copyDatabase` holds ZERO rows in `held_keys`, read from the
 *     copy's table — while the office it was copied from really held rows (the control);
 *   · the SOURCE is untouched: it still holds every hash, and the key still works in the office;
 *   · a key that works in the office proves nothing in the world made from the copy: the starter's
 *     key alone is refused the person's act once the window is closed, and another agent's key is
 *     refused with the sentence naming who may;
 *   · the world still works: it mints its own key file beside its own database, the key file is not
 *     the office's, and while the world's window is open the starter and the secretary still do the
 *     person's acts there BY NAME; once it is closed, by name is refused (P84's amendment);
 *   · the office's key file and a world's are different files because the path is derived from the
 *     database, which is the one reason the office's keys never reach a world.
 *
 * EVERY KEY HERE IS A MADE-UP VALUE. No real key is written, printed or asserted anywhere. The
 * assertions name status codes, record ids, hashes and file paths, never a key's bytes.
 *
 * THE WINDOW IS CLOSED IN THE WORLD under test. The office keeps the person's-device window open so
 * its own key path is unchanged, but that open window would make a headerless request in a world the
 * person again — masking whether the KEY proved anything. With it closed, the starter's key alone is
 * the only thing that could do the person's act, so its refusal is evidence about the key itself.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. In tools/isolated-mole-office.mjs, take the `delete from held_keys` out of `copyDatabase` →
 *      "the copy has no key hashes" goes red, and "the starter's copied key proves nothing" goes red
 *      because the copied row proves the starter again.
 *   2. Open the emptying on `from` (the source file) instead of `to` (the copy) → "the source is
 *      untouched" goes red and the copy case goes red. That is the unrecoverable mistake, and this
 *      is the test that catches it.
 *   3. In src/config/settings.mjs, make `keysPathFrom` name a fixed directory instead of the
 *      database's → the two key-file cases go red, because the world's key file would not be beside
 *      the world's database.
 */

import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import Database from 'better-sqlite3'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { databaseDirectoryFrom, keysPathFrom } from '../src/config/settings.mjs'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import { copyDatabase } from '../tools/isolated-mole-office.mjs'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const STARTER_KEY = 'made-up-key-of-the-worlds-starter-1111'
const SECRETARY_KEY = 'made-up-key-of-the-secretary-2222'
const OTHER_KEY = 'made-up-key-of-some-other-agent-3333'
const DEVICE_KEY = 'made-up-key-of-an-ended-device-4444'

interface HeldRow {
  whose_kind: string
  whose_id: string
  key_hash: string
}

function heldRowsOf(db: Database.Database): HeldRow[] {
  return db
    .prepare('SELECT whose_kind, whose_id, key_hash FROM held_keys ORDER BY key_hash')
    .all() as HeldRow[]
}

/** The actor on the newest change of one record, read the way the office reads it. */
function actorOn(t: TestDb, recordId: string): { type: string; id: string } | undefined {
  return t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(recordId) as { type: string; id: string } | undefined
}

async function ask(
  at: string,
  method: 'GET' | 'POST',
  path: string,
  payload: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; error: string; recordId: string }> {
  const res = await fetch(`${at}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const body = (await res.json()) as { error?: string; record?: { id?: string } }
  return { status: res.status, error: body.error ?? '', recordId: body.record?.id ?? '' }
}

let source: TestDb
let copyDir: string
let copyFile: string
/** The office's rows before the copy, and after it, so "unchanged" is a comparison and not a count. */
let sourceBefore: HeldRow[]
let sourceAfter: HeldRow[]
/** What the tool's own copy holds in `held_keys`, read from the copy. */
let copyHeldKeys: number
/** Whether a key file was beside the copy BEFORE the world's server started, which proves no copy. */
let worldKeyWasThereBeforeTheWorldStarted: boolean
/** The office act with the starter's key, driven after the copy was made. */
let officeAct: { status: number; actor: { type: string; id: string } | undefined }
/** The registry id the office gave `builder-pb`. It is not the handle. */
let builderId: string
let world: FastifyInstance
let worldAt: string
/** The world's own database handle, so the copy's file can be closed before it is deleted. */
let worldClient: { sqlite: Database.Database } | undefined

beforeAll(async () => {
  source = await freshDb()
  copyDir = mkdtempSync(join(tmpdir(), 'mole-world-copy-'))
  copyFile = join(copyDir, 'copy.db')

  // THE HOLDER OF THE OFFICE KEY IS A REGISTERED AGENT. The records door refuses a write under an
  // agent id no registry row holds, and the act below is driven under `builder-pb` with that key.
  // Holding a key proves the holder; the registry row is what makes the name one the office has.
  source.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'builder-pb',
    data: { handle: 'builder-pb', state: 'active', runtime: 'claude-code' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })
  builderId = (
    source.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('builder-pb') as { id: string }
  ).id

  // AND SO IS THE OTHER AGENT WHOSE KEY IS MADE UP BELOW, for the same reason. Under the narrow
  // rule an agent id no registry row holds is refused before the act it is meant to test, so the
  // world would answer with the registry refusal instead of its own key refusal. The copy carries
  // this row because it is taken after it is filed.
  source.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'some-other-agent',
    data: { handle: 'some-other-agent', state: 'active', runtime: 'claude-code' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })

  // THE OFFICE'S OWN TABLE, with an agent key, a secretary key, another agent's key and an ENDED
  // device key. Every one of them is a made-up value; only their SHA-256 is ever stored.
  const keys = await import('../src/server/lib/keys.ts')
  keys.holdTheKeyWhoseHashIs('agent', 'builder-pb', keys.keyHash(STARTER_KEY), null)
  keys.holdTheKeyWhoseHashIs('agent', THE_TEST_OFFICES_SECRETARY.handle, keys.keyHash(SECRETARY_KEY), null)
  keys.holdTheKeyWhoseHashIs('agent', 'some-other-agent', keys.keyHash(OTHER_KEY), null)
  const ended = keys.holdTheKeyWhoseHashIs('person-device', 'a-device-that-was-ended', keys.keyHash(DEVICE_KEY), null)
  keys.revokeTheKeyNamed(ended, 'the person ended this device before the copy was taken')
  sourceBefore = heldRowsOf(source.client.sqlite)

  // THE OFFICE, which is never a test world, and which really does recognise the starter's key.
  // It stays listening across the copy, and the act below is driven AFTER the copy was made, so
  // this measures what the office still accepts once the copy exists rather than before it.
  const office = await apiApp()
  await office.app.ready()
  await office.app.listen({ host: '127.0.0.1', port: 0 })
  const officeAt = `http://127.0.0.1:${String((office.app.server.address() as AddressInfo).port)}`

  // THE COPY, made by the tool's own function. This is the moment under test.
  const copied = await copyDatabase(source.file, copyFile)
  expect(copied.problems, `copyDatabase refused: ${JSON.stringify(copied.problems)}`).toEqual([])

  // AND THE OFFICE STILL ANSWERS WITH ITS KEY AFTERWARD. Driven here, after the copy, so the test
  // below is about the state the copy left the office in and not about a time before it.
  const wrote = await ask(
    officeAt,
    'POST',
    '/api/records',
    { kind: 'note', title: 'A note the office attributes to the starter’s key', data: { body: 'x' } },
    { 'x-mole-office-key': STARTER_KEY },
  )
  officeAct = { status: wrote.status, actor: actorOn(source, wrote.recordId) }
  sourceAfter = heldRowsOf(source.client.sqlite)
  await office.app.close()

  // The copy's own window is closed here so a key that proves nothing is not masked by the
  // headerless fallback. Read `held_keys` from the same writable handle.
  const copy = new Database(copyFile)
  try {
    copy
      .prepare(
        "UPDATE installation SET window_closed_at = '2026-09-13 15:00:00', window_closed_by_kind = 'person', " +
          `window_closed_by_id = '${THE_TEST_OFFICES_OWNER.id}' WHERE only_row = 1`,
      )
      .run()
    copyHeldKeys = (copy.prepare('SELECT count(*) AS n FROM held_keys').get() as { n: number }).n
  } finally {
    copy.close()
  }
  worldKeyWasThereBeforeTheWorldStarted = existsSync(join(copyDir, 'keys.json'))

  // THE WORLD, served from the copy and told who started it and who its secretaries are.
  vi.resetModules()
  process.env.MOLE_OFFICE_DB = copyFile
  process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'builder-pb'
  process.env.MOLE_OFFICE_WORLD_SECRETARIES = THE_TEST_OFFICES_SECRETARY.handle
  forgetTheWorldsOwnAuthority()
  const built = await apiApp()
  world = built.app
  await world.ready()
  await world.listen({ host: '127.0.0.1', port: 0 })
  worldAt = `http://127.0.0.1:${String((world.server.address() as AddressInfo).port)}`
  // The module the world was built from, so its connection is closed before the copy is deleted.
  worldClient = await import('../src/server/db/client.ts')
  // A fresh database, two servers and a second import of the modules. On 5 October this took more
  // than the default 10 seconds while several waves' tests ran on the machine at once.
  // Problem `lqBrJv8_Jsvk`.
}, 60_000)

afterAll(async () => {
  await world?.close()
  worldClient?.sqlite.close()
  source?.close()
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  if (copyDir !== undefined) rmSync(copyDir, { recursive: true, force: true })
})

// ============================================================ 1. the copy has no key hashes

describe('the copy the tool makes', () => {
  it('holds no key hashes at all, while the office it came from held four', () => {
    expect(sourceBefore.length, 'the office held nothing to copy, so this proves nothing').toBe(4)
    expect(copyHeldKeys, 'the copy carries key hashes, so a world made from it trusts them').toBe(0)
  })
})

// ============================================================ 2. the source is untouched

describe('the office the copy was taken from', () => {
  it('still holds every key hash it held before the copy, row for row', () => {
    expect(sourceAfter).toEqual(sourceBefore)
    expect(sourceAfter.length).toBe(4)
  })

  it('still lets the same key work there, attributed to its holder', () => {
    expect(officeAct.status, 'the office stopped accepting a key the copy is about').toBe(201)
    // The office stamps the holder's registry id, not its handle.
    expect(officeAct.actor, 'the key proved its holder in the office').toEqual({ type: 'agent', id: builderId })
  })
})

// ============================================================ 3. a copied key proves nothing there

describe('a key that works in the office proves nothing in the world', () => {
  it('refuses the starter’s copied key the person’s act, once the window is closed', async () => {
    const said = await ask(
      worldAt,
      'POST',
      '/api/office/trusted-machines',
      { address: 'a-machine' },
      { 'x-mole-office-key': STARTER_KEY },
    )
    expect(said.status, JSON.stringify(said).slice(0, 400)).toBe(403)
    // SINCE KEYS WAVE PIECE 6A a write whose key proves nothing is refused before the door, once the
    // window is closed, so the words are that refusal's and they say nothing was written.
    expect(said.error, 'it says nothing was written').toContain('Nothing was written')
    expect(said.error, 'it names the starter who may do it by name').toContain('builder-pb')
    expect(said.error, 'it names the secretary who may do it by name').toContain(THE_TEST_OFFICES_SECRETARY.handle)
    expect(said.error, 'it never carries the key’s bytes').not.toContain(STARTER_KEY)
  })

  it('refuses another agent’s key the person’s act, with the sentence naming who may', async () => {
    const said = await ask(
      worldAt,
      'POST',
      '/api/office/trusted-machines',
      { address: 'a-second-machine' },
      {
        'x-mole-office-key': OTHER_KEY,
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'some-other-agent',
      },
    )
    expect(said.status, JSON.stringify(said).slice(0, 400)).toBe(403)
    expect(said.error, 'it names the holder that asked').toContain('some-other-agent')
    expect(said.error, 'it says nothing was written').toContain('Nothing was written')
    expect(said.error, 'it names the starter').toContain('builder-pb')
    expect(said.error, 'it names the secretary').toContain(THE_TEST_OFFICES_SECRETARY.handle)
  })

  it('refuses an ended device’s copied key the person’s act', async () => {
    const said = await ask(
      worldAt,
      'POST',
      '/api/office/trusted-machines',
      { address: 'a-third-machine' },
      { 'x-mole-office-key': DEVICE_KEY },
    )
    expect(said.status, JSON.stringify(said).slice(0, 400)).toBe(403)
    expect(said.error, 'it says nothing was written').toContain('Nothing was written')
  })
})

// ============================================================ 4. the world still works

describe('the world made from the copy', () => {
  it('mints its own key file beside its own database, and the tool copied none', () => {
    expect(
      worldKeyWasThereBeforeTheWorldStarted,
      'a key file was beside the copy before the world started, so the tool copied one',
    ).toBe(false)
    expect(existsSync(join(copyDir, 'keys.json')), 'the world minted no key file beside its database').toBe(true)
  })

  /**
   * ONCE THE WINDOW IS CLOSED, BY NAME IS NOT ENOUGH, as the amendment of P84 of 13 September 2026
   * says: "the starter's handle from loopback holding the owner's authority while the window is open
   * and only the starter's key and the secretary's key holding it once the window is closed". Keys
   * wave piece 6a (finding 79) made that true; before it an agent's name with no key counted
   * after the close too, and this file asserted that.
   */
  it('refuses its starter the person’s act by name while the world’s window is closed', async () => {
    const said = await ask(
      worldAt,
      'POST',
      '/api/office/trusted-machines',
      { address: 'a-machine-by-name-after-the-close' },
      { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-pb' },
    )
    expect(said.status, JSON.stringify(said).slice(0, 400)).toBe(403)
    expect(said.error).toContain("an agent's name counts only with that agent's own key")
  })

  it('opens the world’s window again, so the two cases below ask by name while it is open', async () => {
    worldClient?.sqlite
      .prepare('UPDATE installation SET window_closed_at = NULL, window_closed_by_kind = NULL, window_closed_by_id = NULL WHERE only_row = 1')
      .run()
    const { forgetTheKeyWindowThisProcessRead, theKeyWindowIsClosed } = await import('../src/server/lib/keywindow.ts')
    forgetTheKeyWindowThisProcessRead()
    expect(theKeyWindowIsClosed()).toBe(false)
  })

  it('lets its starter do the person’s act by name', async () => {
    const said = await ask(
      worldAt,
      'POST',
      '/api/office/trusted-machines',
      { address: 'a-fourth-machine' },
      { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-pb' },
    )
    expect(said.status, JSON.stringify(said).slice(0, 400)).toBeLessThan(300)
  })

  it('lets a secretary do the person’s act by name', async () => {
    const said = await ask(
      worldAt,
      'POST',
      '/api/office/trusted-machines',
      { address: 'a-fifth-machine' },
      { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle },
    )
    expect(said.status, JSON.stringify(said).slice(0, 400)).toBeLessThan(300)
  })
})

// ============================================================ 5. the key file stays out by derivation

describe('the office’s key file and a world’s key file', () => {
  it('are different files, each beside its own database, because the path comes from the database', () => {
    // THE PATH IS WORKED OUT FROM THE DATABASE, which tests/one-function-answers-a-database-directory
    // already pins for `keysPathFrom` itself. What is added here is the pair that matters: the office
    // and a world resolve to different files, and both files exist where the derivation says.
    const officeKey = keysPathFrom({ MOLE_OFFICE_DB: source.file })
    const worldKey = keysPathFrom({ MOLE_OFFICE_DB: copyFile })
    expect(worldKey, 'a world and the office would share one key file').not.toBe(officeKey)
    expect(dirname(officeKey)).toBe(databaseDirectoryFrom(source.file))
    expect(dirname(worldKey)).toBe(databaseDirectoryFrom(copyFile))
    expect(existsSync(officeKey), 'the office’s key file is not beside the office’s database').toBe(true)
    // THE WORLD'S FILE IS THE ONE BESIDE THE WORLD'S DATABASE, which a fixed-directory derivation
    // would move away and this would catch.
    expect(existsSync(join(copyDir, 'keys.json')), 'the world’s key file is not beside the copy').toBe(true)
    expect(existsSync(join(dirname(copyFile), 'keys.json'))).toBe(true)
  })
})
