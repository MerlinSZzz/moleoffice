// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S KEY IS BOUND TO THE AGENT AND NOT TO THE NAME IT GOES BY. Criterion I5 of
 * design/agents/IDENTITY-ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES WRONG WHEN A KEY IS BOUND TO A NAME
 * ---------------------------------------------------------------------------------------
 *
 * `held_keys.whose_id` held an agent's HANDLE. A handle is a name somebody chose: it can be changed
 * in place, and after piece I-2 it is free again when its agent retires, so a NEW agent can be
 * registered under a RETIRED agent's name. Three things follow from a key kept under the name, and
 * every one of them is silent:
 *
 *   THE NEW AGENT IS REFUSED ITS OWN KEY. Both registration doors ask `aKeyWasEverHeldBy` before
 *   they answer one. Asked by name, that finds the retired agent's row and the new agent is told it
 *   already holds a key it has never been given.
 *
 *   THE RETIRED AGENT'S KEYS ARE REVOKED BY SOMEBODY ELSE'S RETIREMENT, and the new agent's by the
 *   retired one's, because `revokeEveryLiveKeyHeldBy` revokes by the same name.
 *
 *   THE EMBASSY DRAWS THE WRONG REVOKE PRESS, because it reads the live key of a row by whichever
 *   of the two references that row happens to carry.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE OTHER HALF: A DIFFERENCE OF SPELLING IS NOT A DIFFERENT AGENT
 * ---------------------------------------------------------------------------------------
 *
 * The change log's `provedHolder` draws a line saying one agent's key wrote a row under another
 * agent's name. Once a key is bound to the id, an agent that sends its handle on the request differs
 * from its own key by spelling alone, and comparing the two as characters would put that line on
 * almost every row in the product and make it mean nothing. So the two are compared as AGENTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE AGENT ROWS ARE WRITTEN STRAIGHT AT THE TABLE
 * ---------------------------------------------------------------------------------------
 *
 * Every case here needs an agent whose id is NOT its handle, and the registration door on this
 * branch still sets an agent's id to its handle: the mint is piece I-1b and lands after this one.
 * So the rows are inserted, which is what tests/one-resolver-answers-every-arriving-reference.ts
 * does and for the same reason — a test of a rule about rows no door can make yet has to make one.
 * The shape is real twice over: it is what an agent registered after the mint holds, and it is what
 * a RENAMED agent holds today, because the rename door follows a record's handle with an UPDATE and
 * never touches the id.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. In src/server/lib/keys.ts, make `theHolderAnAgentsKeysAreKeptUnder` return `whoseId`
 *      unchanged → the key is kept under the name again: six cases red.
 *   2. In src/server/lib/http.ts, put `provedHolder` back to `proof.whoseId === id` → an agent
 *      sending its own handle beside its own key is marked as somebody else: one case red.
 *   3. In `theKeyProvedTheNameTheHeadersGave`, return true always → a key that really does prove a
 *      different agent stops being marked: one case red.
 *   4. In `aHeldKeyThisWorldTrusts`, put back `held.whose_id === world.startedBy ||
 *      world.secretaries.includes(held.whose_id)` → a world stops trusting its own starter and its
 *      own secretary: two cases red.
 *   5. Make `theLiveKeyHeldBy` skip the resolving and read by the string it was given → the name no
 *      longer finds the key and the Embassy's two reads disagree again: three cases red.
 *   6. Make `theHandleOfTheAgentAKeyProves` return `whoseId` → a person reads a minted id where a
 *      name stood, in the world's refusal and in the reason a world gives for who may act: three
 *      cases red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

type KeysLib = typeof import('../src/server/lib/keys.ts')

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_STARTERS_KEY = 'made-up-key-of-a-worlds-starter-i5'
const A_SECRETARYS_KEY = 'made-up-key-of-a-secretary-i5'
const SOMEBODY_ELSES_KEY = 'made-up-key-of-some-other-agent-i5'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/**
 * The `assets` row an agent's picture points at.
 *
 * `agents.avatar_asset_id` carries a foreign key into `assets` and is never null, so a row written
 * straight at the table needs its picture row first. This is the same `default` origin row
 * src/server/db/participants-migration.ts writes for every agent it registers.
 */
function aDrawnPictureRow(t: TestDb, assetId: string): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(assetId, '2026-09-01 10:00:00')
}

/** One agent row, with whatever id and handle the case needs. */
function anAgentRow(
  t: TestDb,
  id: string,
  handle: string,
  name: string,
  retired: { on: string } | null = null,
): string {
  aDrawnPictureRow(t, `avatar-default-agent-${id}`)
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      name,
      handle,
      `avatar-default-agent-${id}`,
      retired === null ? 0 : 1,
      retired === null ? null : retired.on,
      '2026-09-01 10:00:00',
    )
  return id
}

/** Every `held_keys` row kept under one string, whatever the string is. */
function keyRowsKeptUnder(t: TestDb, whoseId: string): { id: string; kind: string }[] {
  return t.client.sqlite
    .prepare('SELECT id, whose_kind AS kind FROM held_keys WHERE whose_id = ? ORDER BY rowid')
    .all(whoseId) as { id: string; kind: string }[]
}

/** What a reader threw, as the caller would meet it. */
function refusalFrom(run: () => unknown): { message: string; status: number } {
  try {
    run()
  } catch (error) {
    const held = error as { message?: unknown; status?: unknown }
    return { message: String(held.message ?? ''), status: Number(held.status ?? 0) }
  }
  throw new Error('nothing was refused')
}

// ======================================================= 1. the key is kept under the agent's id

describe('a key minted for an agent named by its handle', () => {
  let t: TestDb
  let keys: KeysLib
  const EMBER = 'Yh3kQ2mVb8Tz'

  beforeAll(async () => {
    t = await freshDb()
    keys = await import('../src/server/lib/keys.ts')
    anAgentRow(t, EMBER, 'ember', 'Ember')
    keys.makeAnAgentKey('ember', null)
  })

  afterAll(() => {
    t.close()
  })

  it('keeps the row under the id and not under the name', () => {
    expect(keyRowsKeptUnder(t, EMBER), 'one row, kept under the agent id').toHaveLength(1)
    expect(keyRowsKeptUnder(t, 'ember'), 'and nothing kept under the name').toHaveLength(0)
  })

  it('answers the same key whether the holder is asked for by id or by name', () => {
    const byId = keys.theLiveKeyHeldBy('agent', EMBER)
    const byName = keys.theLiveKeyHeldBy('agent', 'ember')
    expect(byId?.id, 'the id finds the key').toBeTruthy()
    expect(byName?.id, 'and so does the name').toBe(byId?.id)
    expect(keys.aKeyWasEverHeldBy('agent', EMBER)).toBe(true)
    expect(keys.aKeyWasEverHeldBy('agent', 'ember')).toBe(true)
  })

  it('revokes that agent’s keys whichever of its two names the retirement knows', () => {
    expect(keys.revokeEveryLiveKeyHeldBy('agent', 'ember', 'Ember was retired.')).toBe(1)
    expect(keys.theLiveKeyHeldBy('agent', EMBER), 'nothing live is left').toBeNull()
    expect(keys.aKeyWasEverHeldBy('agent', EMBER), 'and the revoked row is still the record').toBe(true)
  })
})

// ================================================= 2. a freed name inherits no key history at all

describe('a retired agent whose name a new agent has taken', () => {
  let t: TestDb
  let keys: KeysLib
  /** The retired agent's id IS the string it was registered under: one of the 370 legacy rows. */
  const QUILL_THEN = 'quill'
  const QUILL_NOW = 'Mb2kR7pXn4Ws'

  beforeAll(async () => {
    t = await freshDb()
    keys = await import('../src/server/lib/keys.ts')
    // THE RETIRED AGENT, and the name released. This is what piece I-2 leaves behind: the id is
    // untouched, because criterion I4 rewrites no stored value.
    anAgentRow(t, QUILL_THEN, 'quill', 'Quill', { on: '2026-09-10 14:00:00' })
    keys.makeAnAgentKey(QUILL_THEN, null)
    t.client.sqlite.prepare('UPDATE agents SET handle = ? WHERE id = ?').run('quill-the-first', QUILL_THEN)
    // AND THE NEW AGENT THAT TOOK THE NAME.
    anAgentRow(t, QUILL_NOW, 'quill', 'Quill Two')
  })

  afterAll(() => {
    t.close()
  })

  it('leaves the new agent holding no key at all', () => {
    expect(keys.theLiveKeyHeldBy('agent', QUILL_NOW), 'it has been given none').toBeNull()
    expect(keys.aKeyWasEverHeldBy('agent', QUILL_NOW), 'and never held one').toBe(false)
  })

  it('keeps the retired agent’s key findable by the id it was minted under', () => {
    // THE STORED-ID READER, which is the question the Embassy asks about the row it is drawing: an
    // id names one agent for ever, so it is never ambiguous however many agents bear it as a name.
    expect(keys.theLiveKeyOfTheAgentWithThisId(QUILL_THEN)?.id, 'the retired agent still holds it').toBeTruthy()
    expect(keys.theLiveKeyOfTheAgentWithThisId(QUILL_NOW), 'and the new agent holds none').toBeNull()
  })

  it('refuses the bare name rather than handing one agent’s key history to the other', () => {
    // "quill" is one agent's id and the other's live handle, and this is the ARRIVING question — a
    // name somebody typed. Picking either agent would be a guess about whose key it is, which is
    // the worst thing in the product to guess at, so it is refused and the refusal names both
    // agents and the id to send instead.
    const refused = refusalFrom(() => keys.theLiveKeyHeldBy('agent', 'quill'))
    expect(refused.status).toBe(409)
    expect(refused.message).toContain('Quill')
    expect(refused.message).toContain('Quill Two')
    expect(refused.message).toContain(QUILL_NOW)
  })

  it('retires the new agent without touching the retired one’s key', () => {
    expect(keys.revokeEveryLiveKeyHeldBy('agent', QUILL_NOW, 'Quill Two was retired.')).toBe(0)
    expect(keys.theLiveKeyOfTheAgentWithThisId(QUILL_THEN)?.id, 'the other agent’s key stands').toBeTruthy()
  })
})

// ===================================== 3. the change log marks a different AGENT, not a spelling

describe('the row that says who the key proved', () => {
  let t: TestDb
  let app: FastifyInstance
  let keys: KeysLib
  const EMBER = 'Yh3kQ2mVb8Tz'
  const LARK = 'Zt8nL4vQ1cRy'
  let emberKey = ''

  beforeAll(async () => {
    t = await freshDb()
    keys = await import('../src/server/lib/keys.ts')
    anAgentRow(t, EMBER, 'ember', 'Ember')
    anAgentRow(t, LARK, 'lark', 'Lark')
    emberKey = keys.makeAnAgentKey('ember', null)
    app = (await apiApp()).app
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    t.close()
  })

  /** Write one note with a key, and read the proved holder off the row the write made. */
  async function noteWrittenWith(
    title: string,
    key: string,
    actorId: string,
  ): Promise<{ status: number; proved: { id: string; how: string; claimed: string } | null }> {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...asAgent(actorId), 'x-mole-office-key': key },
      payload: { kind: 'note', title, data: { body: `Written to read the row for "${title}".` } },
    })
    const said = reply.json() as { record?: { id?: string } }
    const row = t.client.sqlite
      .prepare('SELECT proved_holder AS proved FROM changes WHERE record_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(said.record?.id ?? '') as { proved: string | null } | undefined
    return {
      status: reply.statusCode,
      proved: row?.proved === null || row?.proved === undefined ? null : JSON.parse(row.proved),
    }
  }

  it('says nothing when the agent sends its own name beside its own key', async () => {
    const byName = await noteWrittenWith('Ember writes under its name', emberKey, 'ember')
    expect(byName.status, 'the write went through').toBe(201)
    expect(byName.proved, 'one agent said two ways is not two agents').toBeNull()
  })

  it('says nothing when the agent sends its own id beside its own key', async () => {
    const byId = await noteWrittenWith('Ember writes under its id', emberKey, EMBER)
    expect(byId.status).toBe(201)
    expect(byId.proved).toBeNull()
  })

  /**
   * A DIFFERENT AGENT IS REFUSED NOW, AND NOT MARKED. A decision refuses an agent's key under another agent's name and
   * names both, so no row is written for the column to mark. The comparison is still the one
   * above: the same agent said two ways goes through, and only a different agent is refused.
   */
  it('refuses the write when the key really does prove a different agent, naming both', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...asAgent('lark'), 'x-mole-office-key': emberKey },
      payload: { kind: 'note', title: 'Ember’s key writes under Lark’s name', data: { body: 'Refused.' } },
    })
    expect(reply.statusCode, reply.body).toBe(403)
    expect(String((reply.json() as { error?: string }).error)).toContain(
      'This request carries the key of Ember ("ember") and its header names Lark ("lark").',
    )
    const written = t.client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM records WHERE title = ?')
      .get('Ember’s key writes under Lark’s name') as { n: number }
    expect(written.n, 'nothing was written').toBe(0)
  })
})

// ================================== 4. a test world still trusts its starter and its secretary

describe('a test world whose starter and secretary have ids of their own', () => {
  let t: TestDb
  let app: FastifyInstance
  const STARTER = 'Pq5wR8tYu2Ac'
  const SECRETARY = 'Kd7fG1hJ3lZx'

  beforeAll(async () => {
    t = await freshDb()
    // THE WORLD IS TOLD IN HANDLES, which is what tools/isolated-mole-office.mjs writes: it reads
    // the starter off the ledger row and the secretaries off their cards, and a person reads both
    // in the refusal. Since criterion I5 the key's holder is an id, so the two sides are two shapes
    // of name and the trust reading has to resolve them before it compares.
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'builder-pb'
    process.env.MOLE_OFFICE_WORLD_SECRETARIES = THE_TEST_OFFICES_SECRETARY.handle
    forgetTheWorldsOwnAuthority()
    anAgentRow(t, STARTER, 'builder-pb', 'Builder PB')
    anAgentRow(t, SECRETARY, THE_TEST_OFFICES_SECRETARY.handle, THE_TEST_OFFICES_SECRETARY.name)
    anAgentRow(t, 'Ws4xE6rT9yUi', 'some-other-agent', 'Some Other Agent')
    const keys = await import('../src/server/lib/keys.ts')
    keys.holdTheKeyWhoseHashIs('agent', 'builder-pb', keys.keyHash(A_STARTERS_KEY), null)
    keys.holdTheKeyWhoseHashIs('agent', THE_TEST_OFFICES_SECRETARY.handle, keys.keyHash(A_SECRETARYS_KEY), null)
    keys.holdTheKeyWhoseHashIs('agent', 'some-other-agent', keys.keyHash(SOMEBODY_ELSES_KEY), null)
    app = (await apiApp()).app
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    t.close()
    delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
    forgetTheWorldsOwnAuthority()
  })

  /** The person's own act, which is refused to every agent by name in the office. */
  function thePersonsAct(key: string, address: string): Promise<{ status: number; error: string }> {
    return app
      .inject({
        method: 'POST',
        url: '/api/office/trusted-machines',
        headers: {
          'content-type': 'application/json',
          'x-mole-office-workspace': 'default',
          'x-mole-office-key': key,
        },
        payload: { address },
      })
      .then((reply) => ({
        status: reply.statusCode,
        error: String((reply.json() as { error?: string }).error ?? ''),
      }))
  }

  it('keeps the rows under the two agents’ ids and not under their names', () => {
    expect(keyRowsKeptUnder(t, STARTER), 'the starter’s key').toHaveLength(1)
    expect(keyRowsKeptUnder(t, SECRETARY), 'the secretary’s key').toHaveLength(1)
    expect(keyRowsKeptUnder(t, 'builder-pb'), 'and nothing under a name').toHaveLength(0)
  })

  it('lets the starter’s key do the person’s act', async () => {
    const said = await thePersonsAct(A_STARTERS_KEY, 'loquat')
    expect(said.status, said.error).toBeLessThan(300)
  })

  it('lets the secretary’s key do the person’s act', async () => {
    const said = await thePersonsAct(A_SECRETARYS_KEY, 'loquat-two')
    expect(said.status, said.error).toBeLessThan(300)
  })

  it('refuses some other agent’s key and names the holder rather than its id', async () => {
    const said = await thePersonsAct(SOMEBODY_ELSES_KEY, 'loquat-three')
    expect(said.status).toBe(403)
    expect(said.error, 'a person reads a name here, not a minted id').toContain('some-other-agent')
  })
})

// ============================================ 5. the Embassy reads a key by id in both its places

describe('the Embassy, for an agent whose id is not its handle', () => {
  let t: TestDb
  let app: FastifyInstance
  /** The id the confirm minted for Ember's row. It is not the handle, which is the point of this block. */
  let EMBER = ''
  let keyRowId = ''

  beforeAll(async () => {
    t = await freshDb()
    // THE CONFIRM WRITES THE REGISTRY ROW, with an id it mints, and binds the key under that id. The
    // Embassy reads the key twice for this agent: once off the registry row, which asks by the row's
    // id, and once off the credential, which asks by the handle it came in under. Until 25 September
    // 2026 this block wrote the row first and confirmed a visitor under its handle; a visitor may no
    // longer ask under a handle a live agent bears (problem z-9zXhVeAPvA).
    app = (await apiApp()).app
    await app.ready()
    const asked = await app.inject({
      method: 'POST',
      url: '/api/office/visitors',
      headers: asAgent('a-visiting-agent'),
      payload: {
        handle: 'ember',
        name: 'Ember',
        role: 'worker',
        conversationPath: '/logs/ember.jsonl',
        startDirectory: '/work/ember',
      },
    })
    expect(asked.statusCode, asked.body).toBe(201)
    const credentialId = (asked.json() as { credential: { id: string } }).credential.id
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/office/visitors/${credentialId}/confirm`,
      headers: AS_THE_PERSON,
      payload: {},
    })
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    EMBER = (t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'ember' AND retired = 0").get() as {
      id: string
    }).id
    expect(EMBER, 'the row the confirm wrote has an id that is not its handle').not.toBe('ember')
    // AND IT IS A CITIZEN OF THIS OFFICE, which is what puts a registry row on the Embassy at all.
    const registry = await import('../src/server/lib/participants.ts')
    const here = registry.citizenshipHere()
    t.client.sqlite
      .prepare('UPDATE agents SET home_world = ?, home_installation = ?, citizen_since = ? WHERE id = ?')
      .run(here.world, here.installation, '2026-09-01 10:00:00', EMBER)
    const kept = keyRowsKeptUnder(t, EMBER)
    expect(kept, 'the confirm bound the key under the agent’s id').toHaveLength(1)
    keyRowId = kept[0]!.id
  })

  afterAll(async () => {
    await app.close()
    t.close()
  })

  // PROBLEM MBSi6s2JRMOR: this case once expected a second row under the credential's handle, which
  // drew one agent twice. The credential's stored handle is now read as the agent it names, so the
  // agent is drawn once: one agent, one row.
  it('finds the key from the registry row, and draws the agent once, not again under its handle', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    const said = reply.json() as { rows: { who: { kind: string; id: string }; heldKeys: { id: string }[] }[] }

    const byRegistryId = said.rows.find((one) => one.who.id === EMBER)
    expect(byRegistryId, 'the registry row is drawn').toBeTruthy()
    expect(byRegistryId?.heldKeys.map((one) => one.id), 'and it names the key kept under the agent’s id').toEqual([keyRowId])

    const byCredentialHandle = said.rows.filter((one) => one.who.id === 'ember')
    expect(byCredentialHandle, 'one agent, one row: nothing is drawn again under the credential’s handle').toEqual([])
  })
})
