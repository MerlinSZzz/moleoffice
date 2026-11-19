// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE RESOLVER ANSWERS EVERY ARRIVING REFERENCE, AND A STORED REFERENCE IS READ BY A DIFFERENT ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I2 of design/agents/IDENTITY-ACCEPTANCE.md. There are two shapes of reference to an
 * agent in this database and the difference between them is the whole of this piece:
 *
 *   A STORED REFERENCE IS ALWAYS AN ID. It holds the string that was the agent's id when the row was
 *   written, and an id is never reused. It resolves by exact id and by nothing else.
 *
 *   AN ARRIVING REFERENCE MAY BE AN ID OR A NAME. A caller sends whatever it has, and criterion I9
 *   keeps the actor header carrying the handle, so nothing running has to restart on the day.
 *
 * Until this change one statement answered both questions — `SELECT id FROM agents WHERE id = ? OR
 * handle = ?`, with no ordering, so SQLite hands back whichever row it reaches first. That is
 * harmless while every agent's id equals its handle. It becomes a silent wrong-agent answer the day
 * one string can be one agent's id and another agent's name.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ROWS ARE WRITTEN STRAIGHT AT THE TABLE
 * ---------------------------------------------------------------------------------------
 *
 * Every interesting case here needs an agent whose id is NOT its handle, and the registration door
 * on this branch still sets an agent's id to its handle: the mint is piece I-1b and lands after the
 * doors that read a handle as an id have been converted. So these rows are inserted, which is the
 * same thing `anAgentRecordFromBefore` does in tests/participants-registry.test.ts and for the same
 * reason — a test of a rule about rows a door cannot make has to be able to make one.
 *
 * Two shapes are used and both are real:
 *
 *   `aLegacyAgent` — the id IS the handle. That is every one of the 374 rows on the owner's office today, and
 *   a decision leaves them exactly as they are.
 *
 *   `anAgentWithAMintedId` — the id is not the handle. That is what an agent registered after the
 *   mint holds, and it is ALSO what a renamed agent holds today: the door follows a record's handle
 *   with an UPDATE and never touches the id.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   - Put `SELECT id FROM agents WHERE id = ? OR handle = ?` back in place of the five steps and the
 *     ambiguous cases go red: a name that means two agents is answered instead of refused.
 *   - Make `theAgentAStoredIdNames` fall back to the handle and its own block goes red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type RegistryLib = typeof import('../src/server/lib/participants.ts')

let t: TestDb
let registry: RegistryLib

/**
 * ONE OFFICE FOR THE FILE. Every interesting row here is written straight at the `agents` table, and
 * a test office starts with none of them, so each case records the rows it adds and takes them away
 * again. The next case then reads the same table it would have read in a database of its own.
 */
const madeAgentIds: string[] = []
const madeAssetIds: string[] = []

beforeAll(async () => {
  t = await freshDb()
  registry = await import('../src/server/lib/participants.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

afterEach(() => {
  const marks = (count: number): string => Array.from({ length: count }, () => '?').join(', ')
  if (madeAgentIds.length > 0) {
    t.client.sqlite.prepare(`DELETE FROM agents WHERE id IN (${marks(madeAgentIds.length)})`).run(...madeAgentIds)
  }
  if (madeAssetIds.length > 0) {
    t.client.sqlite.prepare(`DELETE FROM assets WHERE id IN (${marks(madeAssetIds.length)})`).run(...madeAssetIds)
  }
  madeAgentIds.length = 0
  madeAssetIds.length = 0
})

/**
 * The `assets` row an agent's picture points at.
 *
 * `agents.avatar_asset_id` carries a foreign key into `assets` and the column is never null, so a row
 * written straight at the table needs its picture row written first. This is the same `default`
 * origin row src/server/db/participants-migration.ts writes for every agent it registers.
 */
function aDrawnPictureRow(assetId: string): void {
  madeAssetIds.push(assetId)
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(assetId, '2026-08-27 10:00:00')
}

/** One agent row, with whatever id and handle the case needs. */
function anAgentRow(
  id: string,
  handle: string,
  name: string,
  retired: { on: string | null } | null = null,
): string {
  madeAgentIds.push(id)
  aDrawnPictureRow(`avatar-default-agent-${id}`)
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
      '2026-08-27 10:00:00',
    )
  return id
}

/** An agent of the shape every row on the owner's office has today: its id IS its handle. */
function aLegacyAgent(handleShapedId: string, name: string, retired: { on: string | null } | null = null): string {
  return anAgentRow(handleShapedId, handleShapedId, name, retired)
}

/** An agent of the shape the mint will give: an id that is not its name. */
function anAgentWithAMintedId(
  id: string,
  handle: string,
  name: string,
  retired: { on: string | null } | null = null,
): string {
  return anAgentRow(id, handle, name, retired)
}

/** What the resolver threw, as the caller would read it. */
function refusalFrom(run: () => unknown): { message: string; status: number } {
  try {
    run()
  } catch (error) {
    const held = error as { message?: unknown; status?: unknown }
    return { message: String(held.message ?? ''), status: Number(held.status ?? 0) }
  }
  throw new Error('nothing was refused')
}

/**
 * The case the whole distinction exists for: one string, two agents.
 *
 * The test secretary's handle is a retired legacy agent's id — it kept that id because nothing is rewritten — and it is
 * also the live handle of a second agent that took the name afterwards.
 */
function twoAgentsNamedArgus(): { legacyId: string; mintedId: string } {
  const legacyId = aLegacyAgent(THE_TEST_OFFICES_SECRETARY.handle, THE_TEST_OFFICES_SECRETARY.name, { on: '2026-09-10 14:00:00' })
  t.client.sqlite.prepare('UPDATE agents SET handle = ? WHERE id = ?').run(`${THE_TEST_OFFICES_SECRETARY.handle}-the-first`, THE_TEST_OFFICES_SECRETARY.handle)
  const mintedId = anAgentWithAMintedId('Yh3kQ2mVb8Tz', THE_TEST_OFFICES_SECRETARY.handle, `${THE_TEST_OFFICES_SECRETARY.name} Two`)
  return { legacyId, mintedId }
}

// =========================================================================== an ordinary name and id

describe('an arriving reference resolves by name and by id', () => {
  it('resolves an arriving handle to the live agent bearing it', () => {
    const minted = anAgentWithAMintedId('Yh3kQ2mVb8Tz', 'builder-x', 'Builder X')

    const found = registry.theAgentAnArrivingReferenceNames('builder-x', 'writing')

    expect(found, 'a live agent was not found by its own handle').not.toBeNull()
    expect(found!.agent.id).toBe(minted)
    expect(found!.agent.handle).toBe('builder-x')
    expect(found!.how, 'the handle step did not answer').toBe('a-live-handle')
  })

  it('resolves an arriving id to that same agent', () => {
    const minted = anAgentWithAMintedId('Yh3kQ2mVb8Tz', 'builder-x', 'Builder X')

    const found = registry.theAgentAnArrivingReferenceNames(minted, 'writing')

    expect(found, 'an agent was not found by its own id').not.toBeNull()
    expect(found!.agent.id).toBe(minted)
    expect(found!.agent.handle).toBe('builder-x')
    expect(found!.how, 'the id step did not answer').toBe('an-id')
  })

  it('answers nobody for a string no agent holds as either, rather than refusing', () => {
    // Absence is a real answer and is not the same fact as ambiguity. The rule that refuses a write
    // from an agent nothing has registered reads this null, so a refusal here would turn a naming
    // question into a permission one.
    expect(registry.theAgentAnArrivingReferenceNames('nobody-has-this-name', 'writing')).toBeNull()
    expect(registry.theAgentAnArrivingReferenceNames('', 'reading')).toBeNull()
    expect(registry.theAgentAnArrivingReferenceNames('   ', 'reading')).toBeNull()
  })

  it('resolves a legacy agent by the handle-shaped id it kept, because nothing was rewritten', () => {
    // A decision: the agents registered before the mint keep their ids.
    // The id step and the handle step both answer for such a row, and they answer with the same agent, so there
    // is nothing to refuse.
    aLegacyAgent(THE_TEST_OFFICES_SECRETARY.handle, THE_TEST_OFFICES_SECRETARY.name)

    const found = registry.theAgentAnArrivingReferenceNames(THE_TEST_OFFICES_SECRETARY.handle, 'writing')
    expect(found!.agent.id).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(found!.how, 'the id step is asked first, so it is the one that answers').toBe('an-id')
  })
})

// =========================================================================== the refusal, step 5

describe('a string that names two agents is refused rather than answered', () => {
  it('refuses, and the refusal names both agents, the state each is in, and the id to send instead', () => {
    const { mintedId } = twoAgentsNamedArgus()

    const refused = refusalFrom(() => registry.theAgentAnArrivingReferenceNames(THE_TEST_OFFICES_SECRETARY.handle, 'writing'))

    expect(refused.status).toBe(409)
    expect(refused.message, 'the refusal does not say the string names two agents').toContain('names two agents')
    // BOTH AGENTS, BY NAME.
    expect(refused.message, 'the refusal does not name the agent whose id it is').toContain(`${THE_TEST_OFFICES_SECRETARY.name},`)
    expect(refused.message, 'the refusal does not name the live agent whose handle it is').toContain(`${THE_TEST_OFFICES_SECRETARY.name} Two`)
    // THE STATE EACH IS IN.
    expect(refused.message, 'the refusal does not say when the first was retired').toContain('2026-09-10 14:00:00')
    expect(refused.message, 'the refusal does not say the second is active').toContain('which is active')
    // AND THE ID TO SEND INSTEAD.
    expect(refused.message, 'the refusal does not give the id to send instead').toContain(mintedId)
  })

  it('refuses a read the same way, because a read may not guess at an ambiguity either', () => {
    twoAgentsNamedArgus()

    const refused = refusalFrom(() => registry.theAgentAnArrivingReferenceNames(THE_TEST_OFFICES_SECRETARY.handle, 'reading'))
    expect(refused.status).toBe(409)
    expect(refused.message).toContain('names two agents')
  })

  it('answers nothing at all, rather than whichever row the database reached first', () => {
    // That is what the one statement it replaces did. Proving a refusal is not the same as proving
    // nothing came back, so this asserts the second thing.
    twoAgentsNamedArgus()
    let answered: unknown = 'nothing'
    try {
      answered = registry.theAgentAnArrivingReferenceNames(THE_TEST_OFFICES_SECRETARY.handle, 'reading')
    } catch {
      answered = 'refused'
    }
    expect(answered, 'an ambiguous name was answered instead of refused').toBe('refused')
  })
})

// =========================================================================== the key, step 1

describe('a key on the request settles the case a name alone cannot', () => {
  it('answers the live agent when its key names it by the id', () => {
    const { mintedId } = twoAgentsNamedArgus()

    const found = registry.theAgentAnArrivingReferenceNames(THE_TEST_OFFICES_SECRETARY.handle, 'writing', mintedId)

    expect(found, 'the key settled nothing').not.toBeNull()
    expect(found!.agent.id).toBe(mintedId)
    expect(found!.how).toBe('the-key')
  })

  it('answers the agent whose key names it by its HANDLE, which is what a key holds today', () => {
    // `held_keys.whose_id` for an agent is its HANDLE on this branch, and the piece that moves it to
    // the minted id has not landed. Step 1 resolves whatever the key names through the id step and
    // the handle steps rather than assuming which it is, so it is right on both sides of that
    // landing. The test secretary's handle with `-the-first` after it is a handle, and it settles the case.
    const { legacyId } = twoAgentsNamedArgus()

    const found = registry.theAgentAnArrivingReferenceNames(THE_TEST_OFFICES_SECRETARY.handle, 'reading', `${THE_TEST_OFFICES_SECRETARY.handle}-the-first`)

    expect(found, 'a key holding a handle settled nothing').not.toBeNull()
    expect(found!.agent.id).toBe(legacyId)
    expect(found!.how).toBe('the-key')
  })

  it('proves nothing when the key’s OWN holder string names two agents, so the refusal stands', () => {
    // THE AMBIGUITY REACHES THE KEY TABLE TOO. While `held_keys.whose_id` holds a handle it can be
    // one agent's id and another agent's name, exactly like an arriving reference. Choosing one of
    // them here would be a silent semantic fallback in the worst possible place: the thing it would
    // settle is who somebody is allowed to be. So the key proves nothing and the caller is refused.
    //
    // The gap closes on its own when that column holds the minted id, because an id is exact.
    twoAgentsNamedArgus()

    const refused = refusalFrom(() => registry.theAgentAnArrivingReferenceNames(THE_TEST_OFFICES_SECRETARY.handle, 'writing', THE_TEST_OFFICES_SECRETARY.handle))

    expect(refused.status).toBe(409)
    expect(refused.message).toContain('names two agents')
  })

  it('does not hand back the key holder when the key names nobody the reference could mean', () => {
    // A key proves who is CALLING, not who the reference names. A door asked about somebody else
    // while holding the caller's own key must answer about the somebody else.
    const asked = anAgentWithAMintedId('Yh3kQ2mVb8Tz', 'builder-x', 'Builder X')
    const reader = anAgentWithAMintedId('Qq8wR4nLc1Vx', 'the-one-asking', 'The One Asking')

    const found = registry.theAgentAnArrivingReferenceNames('builder-x', 'reading', reader)

    expect(found!.agent.id, 'the key answered a question it was not asked').toBe(asked)
    expect(found!.how).toBe('a-live-handle')
  })

  it('falls through to the ordinary steps when the key names nothing this office holds', () => {
    const minted = anAgentWithAMintedId('Yh3kQ2mVb8Tz', 'builder-x', 'Builder X')

    const found = registry.theAgentAnArrivingReferenceNames('builder-x', 'reading', 'a-holder-no-row-answers-to')

    expect(found!.agent.id).toBe(minted)
    expect(found!.how).toBe('a-live-handle')
  })
})

// =========================================================================== the retired name, step 4

describe('a retired agent is found by name for a read and never for a write', () => {
  it('answers a read with the retired agent and the date it was retired', () => {
    const minted = anAgentWithAMintedId('Yh3kQ2mVb8Tz', 'builder-x', 'Builder X', { on: '2026-09-12 09:30:00' })

    const found = registry.theAgentAnArrivingReferenceNames('builder-x', 'reading')

    expect(found, 'a read did not follow the name to the retired agent').not.toBeNull()
    expect(found!.agent.id).toBe(minted)
    expect(found!.how).toBe('a-retired-handle')
    expect(found!.agent.retired).toBe(true)
    expect(found!.agent.retiredAt, 'the answer carries no retirement date').toBe('2026-09-12 09:30:00')
  })

  it('refuses a write under the same name, and the refusal names the retirement', () => {
    const minted = anAgentWithAMintedId('Yh3kQ2mVb8Tz', 'builder-x', 'Builder X', { on: '2026-09-12 09:30:00' })

    const refused = refusalFrom(() => registry.theAgentAnArrivingReferenceNames('builder-x', 'writing'))

    expect(refused.status).toBe(409)
    expect(refused.message, 'the refusal does not name the agent').toContain('Builder X')
    expect(refused.message, 'the refusal does not name the retirement').toContain('2026-09-12 09:30:00')
    expect(refused.message, 'the refusal does not give an id that works').toContain(minted)
  })

  it('says so plainly when nobody recorded the date, rather than inventing one', () => {
    anAgentWithAMintedId('Yh3kQ2mVb8Tz', 'builder-x', 'Builder X', { on: null })

    const refused = refusalFrom(() => registry.theAgentAnArrivingReferenceNames('builder-x', 'writing'))
    expect(refused.message).toContain('retired on a date nobody recorded')
  })

  it('answers a write named by the retired agent’s own id, because an id is exact', () => {
    // Step 4's refusal is about following a NAME. An id says precisely which agent is meant, so it is
    // not a guess, and whether a retired agent may take part at all is a rule other doors own.
    const minted = anAgentWithAMintedId('Yh3kQ2mVb8Tz', 'builder-x', 'Builder X', { on: '2026-09-12 09:30:00' })

    const found = registry.theAgentAnArrivingReferenceNames(minted, 'writing')

    expect(found!.agent.id).toBe(minted)
    expect(found!.how).toBe('an-id')
  })
})

// =========================================================================== the stored reference

describe('a stored reference resolves by exact id and never through a handle', () => {
  it('answers nobody for a string that is an agent’s handle but no agent’s id', () => {
    const minted = anAgentWithAMintedId('Yh3kQ2mVb8Tz', 'builder-x', 'Builder X')

    expect(
      registry.theAgentAStoredIdNames('builder-x'),
      'a stored reference was followed to an agent through its handle',
    ).toBeNull()
    expect(registry.theAgentAStoredIdNames(minted)?.id).toBe(minted)
  })

  it('answers the agent whose id it is, even where another live agent bears that string as a name', () => {
    // The case the whole distinction exists for. A row written by the first agent holds the string
    // of the test secretary's handle, and a live agent now bears that string as its handle. The stored row is the first agent's
    // and no refusal is right here: the string is exact and it means one agent.
    twoAgentsNamedArgus()

    const found = registry.theAgentAStoredIdNames(THE_TEST_OFFICES_SECRETARY.handle)

    expect(found, 'a stored id resolved to nobody').not.toBeNull()
    expect(found!.id).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(found!.name).toBe(THE_TEST_OFFICES_SECRETARY.name)
  })

  it('answers a retired agent, because its id is still its id and its rows are still its rows', () => {
    const minted = anAgentWithAMintedId('Yh3kQ2mVb8Tz', 'builder-x', 'Builder X', { on: '2026-09-12 09:30:00' })

    expect(registry.theAgentAStoredIdNames(minted)?.id).toBe(minted)
  })

  it('answers nobody for a string nothing holds, and for an empty one', () => {
    expect(registry.theAgentAStoredIdNames('nobody-has-this-id')).toBeNull()
    expect(registry.theAgentAStoredIdNames('')).toBeNull()
  })
})

// =========================================================================== the three questions apart

describe('the three questions are asked apart, so one string with two answers is visible', () => {
  it('says which row answered which question', () => {
    const { mintedId } = twoAgentsNamedArgus()

    const could = registry.everyAgentAReferenceCouldName(t.client.sqlite, THE_TEST_OFFICES_SECRETARY.handle)

    expect(could.byId?.id).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(could.liveByHandle?.id).toBe(mintedId)
    expect(could.retiredByHandle, 'no retired row bears this handle any more').toBeNull()
  })

  it('tells a live handle from a retired one', () => {
    const minted = anAgentWithAMintedId('Yh3kQ2mVb8Tz', 'builder-x', 'Builder X', { on: '2026-09-12 09:30:00' })

    const could = registry.everyAgentAReferenceCouldName(t.client.sqlite, 'builder-x')

    expect(could.byId, 'the handle is nobody’s id').toBeNull()
    expect(could.liveByHandle, 'a retired row answered the live question').toBeNull()
    expect(could.retiredByHandle?.id).toBe(minted)
  })
})
