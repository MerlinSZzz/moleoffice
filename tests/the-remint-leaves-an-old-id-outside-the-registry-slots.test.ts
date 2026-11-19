// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT CHANGES AN OLD REGISTRY ID ONLY IN A REGISTRY SLOT. Wave 13s round 175, case 2 of section 10.1 of the
 * re-mint plan, the namespace traps.
 *
 * A throwaway office holds made-up legacy agents. Their old ids are planted where a value may equal one and is not an
 * agent's registry id: an agent record's id, a message's id and the delivery that names it, a revision's id, an asset's
 * id and the agent whose picture it is, a grant's id, a provider's conversation id, a path segment, a word in a title and
 * in a body, a report block's id and a chart's key, a person's id and the key the person holds, and the slots that hold
 * an agent record's id: a run's ranAs, a comment's chosen recipient, agent_runs.agent_id, and a review's recipient and
 * starter. They are planted too in the dispatch's recipient column, which holds an agent record's id or an agent's
 * registry id, and in its taken and written columns, which no writer fills. The office's own row is under its handle
 * and wears the face drawn for that id. A map is staged and applied with the real commands,
 * `npm run db:migrate -- --stage-remint <file>` and `npm run db:migrate -- --remint <file>`. Cases:
 *   1. the fixture contract: each trap reads back the value it was given, that value holds the old id of a legacy agent
 *      of the staged map, and the one trap the schema cannot hold, a message whose id is the agent record's, is refused
 *      by the contract and is not counted as run;
 *   2. the re-mint ran: each legacy agent has its new id and an alias holds its old one, and the columns whose foreign
 *      key goes to agents.id, and the key the agent holds, hold the new id;
 *   3. every trap holds the bytes it held before;
 *   4. every other value in the store is as it was, apart from the registry slots, the aliases, the re-mint's generation
 *      row, its agent-id list in the kept lists, and the plain sites it reads by the rule. The plain sites are read from
 *      the register and from the code's own lists, each only on a row that names an agent, and a value there may change
 *      only by an old id in it becoming its new id.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-leaves-an-old-id-outside-the-registry-slots.test.ts
 * After a green control, copy src/server/lib/registry-aliases/remint-write.ts and remint-map.ts and
 * src/server/db/remint-migration.ts, then make one of these changes:
 *   1. in remint-write.ts, put `WHERE "table" = ? OR 1` in place of `WHERE "table" = ?` in theKeysToAnAgentsId: every
 *      foreign key is rewritten as if it went to agents.id, the delivery's message id and the agent's picture name no
 *      row, the re-mint refuses, and cases 2 and 4 go red;
 *   2. in remint-write.ts, delete ` WHERE whose_kind = 'agent'` from theHeldKeysToMove's query: the person's key is
 *      moved to an agent's new id, and cases 3 and 4 go red;
 *   3. in remint-map.ts, put `from: 'minted'` in place of `from: 'legacy'` on the line that reads an id that is its
 *      handle: no agent is legacy, and cases 1 and 2 go red;
 *   4. in remint-migration.ts, put `0` in place of `renameTheDrawnFaces(sqlite, faces.faces)`: the office's face keeps
 *      the key drawn for its old id, and case 4 goes red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, name, key hash and row here is made up, in a throwaway office. Each command is given only PATH, LANG, a
 * made-up home in the test's own folder and MOLE_OFFICE_DB, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { contentOf, versionOf } from '../src/server/lib/version.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { MOLE_OFFICE_HANDLE, defaultAvatarAssetId } from '../src/shared/participants.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const WHEN = '2026-10-31 03:00:00'
const PROJECT = 'default'
const OWNER = THE_TEST_OFFICES_OWNER.id

// Four made-up legacy agents, each with its handle as its id, and one minted one.
const LARK = 'legacy-lark'
const WREN = 'legacy-wren'
const FINCH = 'legacy-finch'
const ROBIN = 'legacy-robin'
const MINTED = { id: 'MintedLive_1', handle: 'minted-live' }

/** One old id planted where it is not an agent's registry id. */
interface ATrap {
  what: string
  oldId: string
  /** The value planted, which is the old id or holds it as a word. */
  value: string
  plant: (s: Database.Database) => void
  /** What the trap's place holds. */
  read: (s: Database.Database) => unknown
}

const one = (s: Database.Database, sql: string, ...args: unknown[]) => (s.prepare(sql).pluck().get(...args) as unknown) ?? null
/** The value at `path` in the data of the record `id`. */
const inTheData = (s: Database.Database, id: string, ...path: (string | number)[]) =>
  path.reduce<unknown>((value, key) => (value as Record<string | number, unknown> | undefined)?.[key], JSON.parse(one(s, 'SELECT data FROM records WHERE id = ?', id) as string))
const aRecord = (s: Database.Database, id: string, kind: string, title: string, data: unknown) =>
  s.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'fixture')").run(id, PROJECT, OWNER, WHEN, WHEN, kind, title, JSON.stringify(data))

const TRAPS: ATrap[] = [
  {
    what: "an agent record's id",
    oldId: LARK,
    value: LARK,
    plant: (s) => {
      aRecord(s, LARK, 'agent', 'A made-up agent record', {})
      s.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(LARK, LARK)
    },
    read: (s) => one(s, "SELECT id FROM records WHERE id = ? AND kind = 'agent'", LARK),
  },
  { what: "agent_records.record_id, the agent record's id beside the agent's", oldId: LARK, value: LARK, plant: () => {}, read: (s) => one(s, 'SELECT record_id FROM agent_records WHERE record_id = ?', LARK) },
  {
    what: "a message's id",
    oldId: WREN,
    value: WREN,
    plant: (s) => {
      aRecord(s, WREN, 'message', 'A made-up message', { body: `${WREN} asked for this.` })
      s.prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES ('made-up-delivery', ?, 'person', ?, 'delivered', ?)").run(WREN, OWNER, WHEN)
    },
    read: (s) => one(s, "SELECT id FROM records WHERE id = ? AND kind = 'message'", WREN),
  },
  { what: "message_delivery.message_id, the message's id", oldId: WREN, value: WREN, plant: () => {}, read: (s) => one(s, "SELECT message_id FROM message_delivery WHERE id = 'made-up-delivery'") },
  { what: "a word in a message's body", oldId: WREN, value: `${WREN} asked for this.`, plant: () => {}, read: (s) => inTheData(s, WREN, 'body') },
  { what: 'a message whose id is the agent record\'s, which the schema cannot hold', oldId: LARK, value: LARK, plant: (s) => aRecord(s, LARK, 'message', 'A made-up message', {}), read: (s) => one(s, "SELECT id FROM records WHERE id = ? AND kind = 'message'", LARK) },
  {
    what: "a revision's id",
    oldId: FINCH,
    value: FINCH,
    // Its content hash is the one the revision writer gives its content, because the re-mint stops on a wrong one.
    plant: (s) =>
      s
        .prepare("INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, data, op, actor_type, actor_id, at) VALUES (?, ?, ?, 1, ?, 'agent', 'A made-up agent record', '{}', 'create', 'person', ?, ?)")
        .run(FINCH, LARK, PROJECT, versionOf(contentOf({ kind: 'agent', title: 'A made-up agent record', summary: null, data: {}, deletedAt: null })), OWNER, WHEN),
    read: (s) => one(s, 'SELECT id FROM revisions WHERE id = ?', FINCH),
  },
  { what: "an asset's id", oldId: ROBIN, value: ROBIN, plant: () => {}, read: (s) => one(s, 'SELECT id FROM assets WHERE id = ?', ROBIN) },
  { what: "agents.avatar_asset_id, the id of the asset that is the agent's picture", oldId: ROBIN, value: ROBIN, plant: () => {}, read: (s) => one(s, "SELECT avatar_asset_id FROM agents WHERE handle = ?", ROBIN) },
  {
    what: "a grant's id",
    oldId: LARK,
    value: LARK,
    plant: (s) =>
      s.prepare("INSERT INTO resident_read_grants (id, resident_id, reader_id, until, given_at, given_by_kind, given_by_id) VALUES (?, ?, ?, '2026-11-30', ?, 'person', ?)").run(LARK, WREN, LARK, WHEN, OWNER),
    read: (s) => one(s, 'SELECT id FROM resident_read_grants WHERE id = ?', LARK),
  },
  {
    what: "a provider's conversation id",
    oldId: LARK,
    value: LARK,
    plant: (s) =>
      s.prepare("INSERT INTO agent_runs (id, thread_id, runtime, request, created_at, resume_external_id, agent_id) VALUES ('made-up-agent-run', 'made-up-thread', 'claude-code', '{}', ?, ?, ?)").run(WHEN, LARK, LARK),
    read: (s) => one(s, "SELECT resume_external_id FROM agent_runs WHERE id = 'made-up-agent-run'"),
  },
  { what: "agent_runs.agent_id, the agent record's id", oldId: LARK, value: LARK, plant: () => {}, read: (s) => one(s, "SELECT agent_id FROM agent_runs WHERE id = 'made-up-agent-run'") },
  {
    what: 'a path segment',
    oldId: LARK,
    value: `notes/${LARK}/today.md`,
    plant: (s) =>
      s.prepare("INSERT INTO resident_space_writes (id, resident_id, path, bytes, sha256, written_at, written_by_kind, written_by_id) VALUES ('made-up-write', ?, ?, 1, 'made-up-hash', ?, 'person', ?)").run(LARK, `notes/${LARK}/today.md`, WHEN, OWNER),
    read: (s) => one(s, "SELECT path FROM resident_space_writes WHERE id = 'made-up-write'"),
  },
  { what: 'a word in a title', oldId: FINCH, value: `A made-up note that ${FINCH} wrote`, plant: (s) => aRecord(s, 'made-up-note', 'note', `A made-up note that ${FINCH} wrote`, {}), read: (s) => one(s, "SELECT title FROM records WHERE id = 'made-up-note'") },
  {
    what: "a report block's id",
    oldId: LARK,
    value: LARK,
    plant: (s) =>
      aRecord(s, 'made-up-report', 'report', 'A made-up report', {
        blocks: [
          { id: LARK, type: 'text', text: 'Made-up words.' },
          { id: 'made-up-chart', type: 'chart', series: [{ key: WREN, label: 'A made-up series' }] },
        ],
      }),
    read: (s) => inTheData(s, 'made-up-report', 'blocks', 0, 'id'),
  },
  { what: "a chart's key", oldId: WREN, value: WREN, plant: () => {}, read: (s) => inTheData(s, 'made-up-report', 'blocks', 1, 'series', 0, 'key') },
  {
    what: "a person's id",
    oldId: FINCH,
    value: FINCH,
    plant: (s) => {
      s.prepare("INSERT INTO people (id, name, handle, avatar_asset_id, created_at) VALUES (?, 'A made-up person', 'made-up-person', 'made-up-asset', ?)").run(FINCH, WHEN)
      s.prepare("INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) VALUES ('key-of-the-person', 'person', ?, 'made-up-hash-1', ?)").run(FINCH, WHEN)
    },
    read: (s) => one(s, 'SELECT id FROM people WHERE id = ?', FINCH),
  },
  { what: 'held_keys.whose_id, the person who holds the key', oldId: FINCH, value: FINCH, plant: () => {}, read: (s) => one(s, "SELECT whose_id FROM held_keys WHERE id = 'key-of-the-person'") },
  {
    what: "ranAs[].agentId, the agent record's id a run worked as",
    oldId: LARK,
    value: LARK,
    plant: (s) => aRecord(s, 'made-up-run', 'session', 'A made-up run', { ranAs: [{ workspaceId: PROJECT, agentId: LARK }] }),
    read: (s) => inTheData(s, 'made-up-run', 'ranAs', 0, 'agentId'),
  },
  {
    what: "chosenRecipient.agentId, the agent record's id a comment goes to",
    oldId: LARK,
    value: LARK,
    plant: (s) => aRecord(s, 'made-up-comment', 'annotation', 'A made-up comment', { body: 'Made-up words.', chosenRecipient: { kind: 'agent', agentId: LARK } }),
    read: (s) => inTheData(s, 'made-up-comment', 'chosenRecipient', 'agentId'),
  },
  {
    what: "agent_messages.recipient_agent_id, the dispatch's recipient",
    oldId: LARK,
    value: LARK,
    plant: (s) =>
      s.prepare("INSERT INTO agent_messages (id, thread_id, position, role, intent, body, created_at, created_by, recipient_kind, recipient_agent_id, taken_by_agent_id, written_by_agent_id) VALUES ('made-up-dispatch', 'made-up-thread', 0, 'user', 'ask', 'Made-up words.', ?, ?, 'agent', ?, ?, ?)").run(WHEN, OWNER, LARK, LARK, LARK),
    read: (s) => one(s, "SELECT recipient_agent_id FROM agent_messages WHERE id = 'made-up-dispatch'"),
  },
  { what: 'agent_messages.taken_by_agent_id', oldId: LARK, value: LARK, plant: () => {}, read: (s) => one(s, "SELECT taken_by_agent_id FROM agent_messages WHERE id = 'made-up-dispatch'") },
  { what: 'agent_messages.written_by_agent_id', oldId: LARK, value: LARK, plant: () => {}, read: (s) => one(s, "SELECT written_by_agent_id FROM agent_messages WHERE id = 'made-up-dispatch'") },
  {
    what: "reviews.goes_to, the review's recipient",
    oldId: LARK,
    value: JSON.stringify({ kind: 'agent', agentId: LARK }),
    // The entry is a context of the shape the review writer stores, on a made-up note, and it pins no revision.
    plant: (s) =>
      s
        .prepare("INSERT INTO reviews (id, workspace_id, entry, started_at, started_by, started_by_agent, goes_to) VALUES ('made-up-review', ?, ?, ?, ?, ?, ?)")
        .run(PROJECT, JSON.stringify({ target: { kind: 'record', recordId: 'made-up-note', workspaceId: PROJECT } }), WHEN, OWNER, LARK, JSON.stringify({ kind: 'agent', agentId: LARK })),
    read: (s) => one(s, "SELECT goes_to FROM reviews WHERE id = 'made-up-review'"),
  },
  { what: "reviews.started_by_agent, the starter's agent record id", oldId: LARK, value: LARK, plant: () => {}, read: (s) => one(s, "SELECT started_by_agent FROM reviews WHERE id = 'made-up-review'") },
]
/** The trap the schema cannot hold: records.id is a primary key, and the agent record has that id. */
const CANNOT_BE_HELD = ["a message whose id is the agent record's, which the schema cannot hold"]

function theAgents(s: Database.Database): void {
  s.prepare("INSERT INTO assets (id, kind, origin, mime, created_at) VALUES ('made-up-asset', 'avatar', 'default', 'image/svg+xml', ?)").run(WHEN)
  s.prepare("INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, 'avatar', 'default', 'image/svg+xml', ?)").run(ROBIN, WHEN)
  const anAgent = (id: string, handle: string, picture = 'made-up-asset') =>
    s.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at) VALUES (?, ?, ?, ?, ?)').run(id, `Made-up ${handle}`, handle, picture, WHEN)
  for (const id of [LARK, WREN, FINCH]) anAgent(id, id)
  anAgent(ROBIN, ROBIN, ROBIN)
  anAgent(MINTED.id, MINTED.handle)
  // The key the legacy agent holds: a registry slot, which the re-mint moves.
  s.prepare("INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) VALUES ('key-of-lark', 'agent', ?, 'made-up-hash-2', ?)").run(LARK, WHEN)
}

/**
 * THE FIXTURE CONTRACT. Each trap is planted in a savepoint of its own; one the schema refuses is rolled back and named
 * with the reason, and is not counted as run.
 */
function plantTheTraps(s: Database.Database): { planted: ATrap[]; refused: { what: string; because: string }[] } {
  const planted: ATrap[] = []
  const refused: { what: string; because: string }[] = []
  for (const trap of TRAPS) {
    s.exec('SAVEPOINT a_trap')
    try {
      trap.plant(s)
      s.exec('RELEASE a_trap')
      planted.push(trap)
    } catch (error) {
      s.exec('ROLLBACK TO a_trap')
      s.exec('RELEASE a_trap')
      refused.push({ what: trap.what, because: (error as Error).message })
    }
  }
  return { planted, refused }
}

function ran(program: string, args: string[], database: string): { status: number | null; stderr: string } {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const it = spawnSync(program, args, { cwd: REPO, env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: database }, encoding: 'utf8' })
  if (it.error !== undefined) throw it.error
  return { status: it.status, stderr: it.stderr }
}
/** THE REAL COMMAND, `npm run db:migrate -- <args>`, on `database`. */
const theCommand = (database: string, ...args: string[]) => ran(process.execPath, ['--import', 'tsx', 'src/server/db/migrate.ts', ...args], database)

let t: TestDb
let contract: ReturnType<typeof plantTheTraps>
let staged: { status: number | null; stderr: string }
let applied: { status: number | null; stderr: string }
const at = { snapshot: '', after: '', map: '' }
beforeAll(async () => {
  t = await freshDb()
  // The legacy row this fixture reads: put the office's own row back on its handle, wearing the face drawn for that id,
  // as an office made before the change has it.
  const s = t.client.sqlite
  const drawnKeyOf = (id: string) => defaultAvatarAssetId({ kind: 'agent', id })
  const minted = s.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').pluck().get(MOLE_OFFICE_HANDLE) as string
  expect(s.prepare('SELECT avatar_asset_id FROM agents WHERE id = ?').pluck().get(minted)).toBe(drawnKeyOf(minted))
  s.transaction(() => {
    s.pragma('defer_foreign_keys = ON')
    expect(s.prepare('UPDATE assets SET id = ? WHERE id = ?').run(drawnKeyOf(MOLE_OFFICE_HANDLE), drawnKeyOf(minted)).changes).toBe(1)
    s.prepare('UPDATE agents SET id = ?, avatar_asset_id = ? WHERE id = ?').run(MOLE_OFFICE_HANDLE, drawnKeyOf(MOLE_OFFICE_HANDLE), minted)
  })()
  theAgents(t.client.sqlite)
  contract = plantTheTraps(t.client.sqlite)
  ;(await import('../src/server/db/migrate.ts')).migrateInPlace(t.client.sqlite, MIGRATIONS)
  Object.assign(at, { snapshot: join(folder(), 'snapshot.db'), after: join(folder(), 'office.db'), map: join(folder(), 'map.json') })
  t.client.sqlite.prepare('VACUUM INTO ?').run(at.after)
  staged = theCommand(at.after, '--stage-remint', at.map)
  copyFileSync(at.after, at.snapshot)
  applied = staged.status === 0 ? theCommand(at.after, '--remint', at.map) : { status: null, stderr: 'not run: the map was not staged' }
}, 240_000)
afterAll(() => t?.close())

const folder = () => dirname(t.file)
interface AnEntry {
  oldId: string
  newId: string
  from: 'legacy' | 'minted'
}
const theLegacyEntries = () => (JSON.parse(readFileSync(at.map, 'utf8')) as { map: { entries: AnEntry[] } }).map.entries.filter((entry) => entry.from === 'legacy')
function readOnly<T>(file: string, read: (s: Database.Database) => T): T {
  const s = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return read(s)
  } finally {
    s.close()
  }
}
const aWordOf = (value: string, word: string) => new RegExp(`(^|[^A-Za-z0-9_-])${word}($|[^A-Za-z0-9_-])`).test(value)

describe('the fixture contract', () => {
  it('plants every trap the schema can hold, on the old id of a legacy agent, and refuses the one it cannot', () => {
    expect(staged.status, staged.stderr).toBe(0)
    expect(contract.refused.map((one) => one.what)).toEqual(CANNOT_BE_HELD)
    expect(contract.refused[0]!.because).toMatch(/UNIQUE constraint failed: records\.id/)
    expect(contract.planted).toHaveLength(TRAPS.length - CANNOT_BE_HELD.length)
    const legacy = new Set(theLegacyEntries().map((entry) => entry.oldId))
    // The four made-up ones, and the office's own agent, put back on its handle above.
    expect([...legacy].sort()).toEqual([FINCH, LARK, ROBIN, WREN, MOLE_OFFICE_HANDLE])
    readOnly(at.snapshot, (s) => {
      for (const trap of contract.planted) {
        expect(trap.read(s), trap.what).toBe(trap.value)
        expect(aWordOf(trap.value, trap.oldId), trap.what).toBe(true)
        expect(legacy.has(trap.oldId), trap.what).toBe(true)
      }
    })
  })
})

describe('a re-mint of the trapped office', () => {
  it('gives each legacy agent its new id, files its old one as an alias, and moves the registry slots', () => {
    expect(applied.status, applied.stderr).toBe(0)
    const newIdOf = new Map(theLegacyEntries().map((entry) => [entry.oldId, entry.newId]))
    readOnly(at.after, (s) => {
      for (const [oldId, newId] of newIdOf) {
        expect(one(s, 'SELECT handle FROM agents WHERE id = ?', newId), oldId).toBe(oldId)
        expect(one(s, 'SELECT id FROM agents WHERE id = ?', oldId), oldId).toBeNull()
        expect(one(s, "SELECT canonical_id FROM registry_aliases WHERE namespace = 'agent-registry' AND alias_id = ?", oldId), oldId).toBe(newId)
      }
      expect(one(s, 'SELECT agent_id FROM agent_records WHERE record_id = ?', LARK)).toBe(newIdOf.get(LARK))
      expect(s.prepare('SELECT resident_id, reader_id FROM resident_read_grants WHERE id = ?').get(LARK)).toEqual({ resident_id: newIdOf.get(WREN), reader_id: newIdOf.get(LARK) })
      expect(one(s, "SELECT resident_id FROM resident_space_writes WHERE id = 'made-up-write'")).toBe(newIdOf.get(LARK))
      expect(one(s, "SELECT whose_id FROM held_keys WHERE id = 'key-of-lark'")).toBe(newIdOf.get(LARK))
    })
  })

  it('leaves every trap holding the bytes it held before', () => {
    const before = readOnly(at.snapshot, (s) => contract.planted.map((trap) => [trap.what, trap.read(s)]))
    const after = readOnly(at.after, (s) => contract.planted.map((trap) => [trap.what, trap.read(s)]))
    expect(after).toEqual(before)
  })

  it('leaves every other value in the store as it was, apart from the registry slots, the plain sites, the aliases, the generation row and the agent-id list', async () => {
    const { theDigestADrawingIsMadeOf } = await import('../src/server/lib/avatar-drawing.ts')
    const register = await import('../src/server/lib/registry-aliases/identity-positions.ts')
    const { THE_TABLES_SEALS_PIN } = await import('../src/server/lib/registry-aliases/remint-plain.ts')
    const { THE_KEPT_LISTS } = await import('../src/server/db/remint-migration.ts')
    const newIdOf = new Map(theLegacyEntries().map((entry) => [entry.oldId, entry.newId]))
    // A legacy agent's drawn face takes the key of its new id and keeps its old id's digest, and each key to it follows.
    const faceOf = new Map([...newIdOf].map(([oldId, newId]) => [defaultAvatarAssetId({ kind: 'agent', id: oldId }), { id: defaultAvatarAssetId({ kind: 'agent', id: newId }), drawnFrom: theDigestADrawingIsMadeOf({ kind: 'agent', id: oldId }) }]))
    const faceKeys = readOnly(at.snapshot, (s) =>
      new Set(['assets.id', ...theTables(s).flatMap((table) => (s.prepare("SELECT \"from\" FROM pragma_foreign_key_list(?) WHERE \"table\" = 'assets'").pluck().all(table) as string[]).map((column) => `${table}.${column}`))]),
    )
    // A registry slot: agents.id, a column whose foreign key goes to agents.id, and the holder of a key an agent holds.
    const slots = readOnly(at.snapshot, (s) =>
      new Set([
        'agents.id',
        ...theTables(s).flatMap((table) => (s.prepare("SELECT \"from\" FROM pragma_foreign_key_list(?) WHERE \"table\" = 'agents'").pluck().all(table) as string[]).map((column) => `${table}.${column}`)),
      ]),
    )
    const inASlot = (table: string, column: string, row: Record<string, unknown>) =>
      slots.has(`${table}.${column}`) || (table === 'held_keys' && column === 'whose_id' && row['whose_kind'] === 'agent')
    const asMapped = (table: string, column: string, row: Record<string, unknown>, value: unknown) =>
      inASlot(table, column, row)
        ? (newIdOf.get(value as string) ?? value)
        : faceKeys.has(`${table}.${column}`)
          ? (faceOf.get(value as string)?.id ?? value)
          : table === 'assets' && column === 'drawn_from'
            ? (faceOf.get(row['id'] as string)?.drawnFrom ?? value)
            : value
    // A plain site the re-mint reads by the rule: each site of the register that holds an agent's id, the two ledger stamps and
    // the call log's target, apart from the registry slots and the tables seals pin.
    const sealed = new Set<string>(THE_TABLES_SEALS_PIN)
    const BY_THE_RULE = new Set(['registry-id', 'record-or-registry-id', 'as-sent', 'mixed'])
    const plain = new Map<string, { site: string; pair?: { field: string; agent: string }; form?: string }>(
      [...register.PLAIN_ID_COLUMNS.filter((one) => BY_THE_RULE.has(one.holds)), ...register.LEDGER_STAMPS, { site: register.AN_AGENTS_ROUTE_TARGET.site }]
        .filter((one) => !slots.has(one.site) && !sealed.has(one.site.split('.')[0]!))
        .map((one) => [one.site, one]),
    )
    const onAnAgentsRoute = (route: unknown) => typeof route === 'string' && register.AN_AGENTS_ROUTE_TARGET.routes.some((one) => route === one || route.startsWith(`${one}/`))
    // Each only on a row the column beside it says is an agent's, and the call log's target only on an agent's route.
    const atAPlainSite = (table: string, column: string, row: Record<string, unknown>) => {
      const site = plain.get(`${table}.${column}`)
      if (site === undefined) return false
      if (site.pair !== undefined && row[site.pair.field] !== site.pair.agent) return false
      return `${table}.${column}` !== register.AN_AGENTS_ROUTE_TARGET.site || onAnAgentsRoute(row['route'])
    }
    // A value at a plain site may change only by an old id in it becoming its new id: each is compared with every old id
    // given its new one, and a pair's two sides in order.
    const escaped = [...newIdOf.keys()].map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const oldIds = new RegExp(`(^|[^A-Za-z0-9_-])(${escaped.join('|')})(?=$|[^A-Za-z0-9_-])`, 'g')
    const asNew = (table: string, column: string, value: unknown) => {
      if (typeof value !== 'string') return value
      const given = value.replace(oldIds, (_, before: string, id: string) => `${before}${newIdOf.get(id)}`)
      return plain.get(`${table}.${column}`)?.form === 'pair' ? given.split('~').sort().join('~') : given
    }
    const theStore = (file: string, mapped: boolean) =>
      readOnly(file, (s) =>
        Object.fromEntries(
          theTables(s)
            .filter((table) => !THE_REMINTS_OWN.includes(table))
            .map((table) => [
              table,
              (s.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[])
                // The agent-id list the re-mint keeps: one row of a legacy agent's old id and its new one.
                .filter((row) => !(table === THE_KEPT_LISTS && row['list'] === 'agent_id' && newIdOf.get(row['old'] as string) === row['new']))
                .map((row) =>
                  JSON.stringify(
                    Object.entries(row).map(([column, value]) =>
                      atAPlainSite(table, column, row) ? asNew(table, column, value) : mapped ? asMapped(table, column, row, value) : value,
                    ),
                  ),
                )
                .sort(),
            ]),
        ),
      )
    expect(theStore(at.after, false)).toEqual(theStore(at.snapshot, true))
  })
})

/** The tables the re-mint adds rows to and that the case does not read: the aliases it files and the generation row it writes. */
const THE_REMINTS_OWN = ['registry_aliases', 'registry_remint_generations']
const theTables = (s: Database.Database) =>
  s.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").pluck().all() as string[]
