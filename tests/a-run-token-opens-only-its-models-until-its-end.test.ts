// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OLD: the office has identity keys, but no separate router credential or run budget.
 * NEW: a random router token opens exactly one live run's allowed provider/model pairs, until
 * twelve hours after issue or the run's end. Only its hash is held, outside authored records.
 * Replacement is a new generation with the same policy and aggregate spend. It cannot undo an
 * explicit revocation, reset a budget, or extend the old credential. Invalid writes are atomic.
 * WHY: a sandbox must never receive a provider key or gain office identity from a router token.
 *
 * All credentials below are test stand-ins. Clocks are fixed UTC instants, including both clock
 * change nights. The mutation removes the exact pair check; the cross-product refusal turns red.
 */
import Database from 'better-sqlite3'
import { copyFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRunTokenStore } from '../src/server/lib/keyrouter/run-tokens.ts'
import { emptyAndScrub, hashesFoundInTheBytesOf, hashesLeftAfterAtMostOneRewrite, keyHashesACopyIsSearchedFor, NOT_CARRIED_TABLES } from '../src/config/what-a-copy-must-not-carry.mjs'
import { freshDb, type TestDb } from './helpers.ts'

const ISSUE = Date.parse('2026-10-25T01:30:00.000Z')
const TWELVE_HOURS = 12 * 60 * 60 * 1000
const PAIRS = [{ provider: 'deepseek', model: 'chat' }, { provider: 'openrouter', model: 'other/chat' }] as const
let now = ISSUE
let db: Database.Database
let store: ReturnType<typeof createRunTokenStore>

function insertRun(id = 'a-run', state = 'running'): void {
  db.prepare('INSERT INTO records (id, kind, data, deleted_at) VALUES (?, ?, ?, NULL)').run(id, 'session', JSON.stringify({ state }))
}
function snapshot(): unknown { return db.prepare('SELECT * FROM run_tokens ORDER BY id').all() }
function refused(fn: () => unknown, code: string): void { expect(fn).toThrow(expect.objectContaining({ code })) }

beforeEach(() => {
  now = ISSUE
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec('CREATE TABLE records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL, deleted_at TEXT)')
  for (const file of ['0303_a_run_token_opens_only_its_models.sql', '0334_a_run_token_names_its_kind.sql']) {
    db.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  store = createRunTokenStore(db, () => now)
  insertRun()
})
afterEach(() => db.close())

describe('a separate credential opens only its run and policy', () => {
  it('returns fresh random tokens once and stores only their hashes outside identity keys', () => {
    const made = store.mint('a-run', 'casting', PAIRS, 10)
    insertRun('another-run')
    const other = store.mint('another-run', 'casting', PAIRS, 10)
    expect(made.token).toMatch(/^mrt_[A-Za-z0-9_-]{43}$/)
    expect(other.token === made.token).toBe(false)
    const rows = JSON.stringify(snapshot())
    expect(rows.includes(made.token)).toBe(false)
    expect(rows.includes(other.token)).toBe(false)
    expect(store.authorize(made.token, PAIRS[0], 'casting')).toMatchObject({ id: made.id, runId: 'a-run', spent: 0, spendCap: 10 })
    expect(JSON.stringify(store.authorize(made.token, PAIRS[0], 'casting')).includes(made.token)).toBe(false)
    refused(() => store.authorize('not-an-issued-credential', PAIRS[0], 'casting'), 'invalid-token')
  })

  it('checks provider/model pairs without granting their cross product', () => {
    const made = store.mint('a-run', 'casting', PAIRS, 1)
    expect(store.authorize(made.token, PAIRS[1], 'casting').runId).toBe('a-run')
    for (const pair of [
      { provider: PAIRS[0].provider, model: PAIRS[1].model },
      { provider: PAIRS[1].provider, model: PAIRS[0].model },
      { provider: 'absent', model: PAIRS[0].model },
    ]) refused(() => store.authorize(made.token, pair, 'casting'), 'pair-not-allowed')
  })

  it.each(['2026-10-25T01:30:00.000Z', '2027-03-28T01:30:00.000Z'])('ends at exactly twelve hours from the UTC issue instant %s', (instant) => {
    now = Date.parse(instant)
    const made = store.mint('a-run', 'casting', PAIRS, 1)
    expect(made.expiresAt - made.issuedAt).toBe(TWELVE_HOURS)
    now = made.expiresAt - 1
    expect(store.authorize(made.token, PAIRS[0], 'casting').runId).toBe('a-run')
    now += 1
    const before = snapshot()
    refused(() => store.authorize(made.token, PAIRS[0], 'casting'), 'expired-token')
    expect(snapshot()).toEqual(before)
  })

  it('refuses missing, ended, deleted, wrong-kind and unknown-state runs without writes', () => {
    for (const state of ['finished', 'crashed', 'paused', 'orphaned', 'unknown']) {
      insertRun(state, state)
      const before = snapshot()
      refused(() => store.mint(state, 'casting', PAIRS, 1), 'run-not-live')
      expect(snapshot()).toEqual(before)
    }
    refused(() => store.mint('missing', 'casting', PAIRS, 1), 'run-not-live')
    db.prepare("UPDATE records SET kind = 'note' WHERE id = 'a-run'").run()
    refused(() => store.mint('a-run', 'casting', PAIRS, 1), 'run-not-live')
    db.prepare("UPDATE records SET kind = 'session', deleted_at = 'deleted' WHERE id = 'a-run'").run()
    refused(() => store.mint('a-run', 'casting', PAIRS, 1), 'run-not-live')
  })

  it('checks the bound run again on authorization and replacement', () => {
    const made = store.mint('a-run', 'casting', PAIRS, 1)
    db.prepare("UPDATE records SET data = ? WHERE id = 'a-run'").run(JSON.stringify({ state: 'finished' }))
    refused(() => store.authorize(made.token, PAIRS[0], 'casting'), 'run-not-live')
    const before = snapshot()
    refused(() => store.replace(made.id), 'run-not-live')
    expect(snapshot()).toEqual(before)
  })

  it('refuses a cap already reached, including a zero cap, and accumulates spend', () => {
    const made = store.mint('a-run', 'casting', PAIRS, 2)
    store.charge(made.id, 0.75)
    expect(store.authorize(made.token, PAIRS[0], 'casting').spent).toBe(0.75)
    store.charge(made.id, 1.25)
    refused(() => store.authorize(made.token, PAIRS[0], 'casting'), 'cap-reached')
    insertRun('zero')
    const zero = store.mint('zero', 'casting', PAIRS, 0)
    refused(() => store.authorize(zero.token, PAIRS[0], 'casting'), 'cap-reached')
  })

  it('replaces atomically with the same policy and aggregate spend, even after expiry', () => {
    const first = store.mint('a-run', 'casting', PAIRS, 3)
    store.charge(first.id, 1)
    now = first.expiresAt
    const second = store.replace(first.id)
    expect(second.id === first.id).toBe(false)
    expect(second.token === first.token).toBe(false)
    expect(second.issuedAt).toBe(now)
    expect(second.expiresAt).toBe(now + TWELVE_HOURS)
    refused(() => store.authorize(first.token, PAIRS[0], 'casting'), 'revoked-token')
    expect(store.authorize(second.token, PAIRS[0], 'casting')).toMatchObject({ spent: 1, spendCap: 3 })
    refused(() => store.authorize(second.token, { provider: PAIRS[0].provider, model: PAIRS[1].model }, 'casting'), 'pair-not-allowed')
    const before = snapshot()
    refused(() => store.mint('a-run', 'casting', [{ provider: 'other', model: 'wider' }], 100), 'run-already-has-token')
    refused(() => store.replace(first.id), 'revoked-token')
    expect(snapshot()).toEqual(before)
    // A request admitted under the old generation may finish after replacement.
    store.charge(first.id, 2)
    const third = store.replace(second.id)
    refused(() => store.authorize(third.token, PAIRS[0], 'casting'), 'cap-reached')
    expect(db.prepare('SELECT DISTINCT spent FROM run_tokens').all()).toEqual([{ spent: 3 }])
  })

  it('explicit revocation is idempotent and cannot be undone by replace or mint', () => {
    const made = store.mint('a-run', 'casting', PAIRS, 1)
    expect(store.revoke(made.id)).toBe(true)
    expect(store.revoke(made.id)).toBe(false)
    refused(() => store.authorize(made.token, PAIRS[0], 'casting'), 'revoked-token')
    refused(() => store.replace(made.id), 'revoked-token')
    refused(() => store.mint('a-run', 'casting', PAIRS, 1), 'run-already-has-token')
  })

  it('validates every input before writing and never echoes credentials in errors', () => {
    for (const cap of [-1, NaN, Infinity, -Infinity, '1', null]) {
      refused(() => store.mint('a-run', 'casting', PAIRS, cap as number), 'invalid-policy')
      expect(snapshot()).toEqual([])
    }
    for (const pairs of [[], null, ['deepseek'], [{ provider: 'deepseek' }], [{ provider: '', model: 'chat' }], [{ provider: 'deepseek', model: 'chat', extra: true }]]) {
      refused(() => store.mint('a-run', 'casting', pairs as unknown as typeof PAIRS, 1), 'invalid-policy')
      expect(snapshot()).toEqual([])
    }
    const made = store.mint('a-run', 'casting', PAIRS, Number.MAX_VALUE)
    for (const amount of [-1, NaN, Infinity, '1', null]) {
      const before = snapshot()
      refused(() => store.charge(made.id, amount as number), 'invalid-spend')
      expect(snapshot()).toEqual(before)
    }
    store.charge(made.id, Number.MAX_VALUE)
    const before = snapshot()
    refused(() => store.charge(made.id, Number.MAX_VALUE), 'invalid-spend')
    expect(snapshot()).toEqual(before)
    try { store.authorize(`${made.token}-wrong`, PAIRS[0], 'casting') } catch (error) {
      expect(String(error).includes(made.token)).toBe(false)
    }
  })

  it('rolls back both replacement and aggregate charging when a write fails', () => {
    const made = store.mint('a-run', 'casting', PAIRS, 10)
    db.exec("CREATE TRIGGER fail_token_insert BEFORE INSERT ON run_tokens BEGIN SELECT RAISE(ABORT, 'test insert failure'); END")
    const before = snapshot()
    expect(() => store.replace(made.id)).toThrow()
    expect(snapshot()).toEqual(before)
    expect(store.authorize(made.token, PAIRS[0], 'casting').spent).toBe(0)
    db.exec('DROP TRIGGER fail_token_insert')
    const next = store.replace(made.id)
    db.exec(`CREATE TRIGGER fail_token_charge BEFORE UPDATE OF spent ON run_tokens WHEN OLD.id = '${next.id}' BEGIN SELECT RAISE(ABORT, 'test charge failure'); END`)
    const charged = snapshot()
    expect(() => store.charge(made.id, 1)).toThrow()
    expect(snapshot()).toEqual(charged)
  })

  it('refuses invalid charge handles and clocks without changing credential history', () => {
    const made = store.mint('a-run', 'casting', PAIRS, 1)
    const before = snapshot()
    for (const operation of [() => store.replace('missing'), () => store.revoke('missing'), () => store.charge('missing', 1)]) refused(operation, 'invalid-token')
    now = NaN
    refused(() => store.replace(made.id), 'invalid-clock')
    refused(() => store.revoke(made.id), 'invalid-clock')
    insertRun('bad-clock')
    refused(() => store.mint('bad-clock', 'casting', PAIRS, 1), 'invalid-clock')
    expect(snapshot()).toEqual(before)
  })
})

describe('two kinds of credential share one run', () => {
  it('keeps one live row per kind, refuses a second of the same kind, and refuses each at the other door', () => {
    const casting = store.mint('a-run', 'casting', [PAIRS[0]], 4)
    const tool = store.mint('a-run', 'tool', [PAIRS[1]], 4)
    expect(casting.kind).toBe('casting')
    expect(tool.kind).toBe('tool')
    expect(store.current('a-run', 'casting')?.kind).toBe('casting')
    expect(store.current('a-run', 'tool')?.kind).toBe('tool')
    expect(store.authorize(casting.token, PAIRS[0], 'casting')).toMatchObject({ kind: 'casting', runId: 'a-run' })
    expect(store.authorize(tool.token, PAIRS[1], 'tool')).toMatchObject({ kind: 'tool', runId: 'a-run' })
    // THE REFUSAL NAMES THE KIND THE CREDENTIAL IS, so a refusal can be traced to Casting or to the tool.
    refused(() => store.authorize(casting.token, PAIRS[0], 'tool'), 'casting-token-at-tool-door')
    refused(() => store.authorize(tool.token, PAIRS[1], 'casting'), 'tool-token-at-casting-door')
    refused(() => store.mint('a-run', 'tool', [PAIRS[0]], 1), 'run-already-has-token')
    // THE INDEX ITSELF HOLDS THE RULE, not only the mint's check.
    const before = snapshot()
    expect(() => db.prepare(
      'INSERT INTO run_tokens (id, run_id, token_hash, allowed_pairs, spend_cap, spent, issued_at, expires_at, kind) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('rt_madeUpSecondToolRow000000', 'a-run', 'a-second-tool-hash', JSON.stringify([PAIRS[0]]), 4, 0, now, now + TWELVE_HOURS, 'tool')).toThrow(/UNIQUE/)
    expect(snapshot()).toEqual(before)
  })

  it('charges both kinds against one run total inside one transaction, right at the cap', () => {
    const casting = store.mint('a-run', 'casting', [PAIRS[0]], 1)
    store.charge(casting.id, 0.25)
    // THE SECOND KIND STARTS ON WHAT THE RUN HAS ALREADY SPENT, and the run's first cap wins over a new one.
    const tool = store.mint('a-run', 'tool', [PAIRS[1]], 9)
    expect(store.authorize(tool.token, PAIRS[1], 'tool')).toMatchObject({ spent: 0.25, spendCap: 1 })
    // BOTH SPEND AT ONCE: their two charges are one transaction, and neither charge is lost.
    db.transaction(() => {
      store.charge(casting.id, 0.5)
      store.charge(tool.id, 0.25)
    }).immediate()
    expect(db.prepare('SELECT DISTINCT spent FROM run_tokens').all()).toEqual([{ spent: 1 }])
    refused(() => store.authorize(casting.token, PAIRS[0], 'casting'), 'cap-reached')
    refused(() => store.authorize(tool.token, PAIRS[1], 'tool'), 'cap-reached')
  })

  it('gives a tool credential the Casting credential’s expiry or shorter, never a longer one', () => {
    const casting = store.mint('a-run', 'casting', [PAIRS[0]], 1)
    now += 60_000
    const tool = store.mint('a-run', 'tool', [PAIRS[1]], 1)
    expect(tool.expiresAt).toBe(casting.expiresAt)
    expect(tool.expiresAt - tool.issuedAt).toBeLessThan(TWELVE_HOURS)
  })
})

describe('the real office keeps the credential private and revokes it with the run', () => {
  let t: TestDb
  let actual: ReturnType<typeof createRunTokenStore>
  let restoreClock = (): void => {}
  const actor = { type: 'system' as const, id: 'mole-office/the-api-server' }
  beforeAll(async () => {
    t = await freshDb()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(ISSUE)
    restoreClock = () => clock.mockRestore()
    actual = createRunTokenStore(t.client.sqlite, () => ISSUE)
  })
  afterAll(() => { restoreClock(); t?.close() })
  function run(): string {
    const made = t.api.createRecord({ kind: 'session', title: 'A test run', data: { state: 'running' }, workspaceId: 'default', actor })
    return made.id
  }

  it('revokes both kinds at every terminal state, crash and orphan included, and does not revive either', () => {
    for (const state of ['finished', 'crashed', 'paused', 'orphaned']) {
      const id = run()
      const casting = actual.mint(id, 'casting', [PAIRS[0]], 1)
      const tool = actual.mint(id, 'tool', [PAIRS[1]], 1)
      t.api.patchRecord(id, { dataPatch: { state } }, actor)
      for (const made of [casting, tool]) {
        expect(t.client.sqlite.prepare('SELECT revoked_at FROM run_tokens WHERE id = ?').get(made.id)).toMatchObject({ revoked_at: ISSUE })
      }
      refused(() => actual.authorize(casting.token, PAIRS[0], 'casting'), 'revoked-token')
      // THE TOOL TOKEN IS REFUSED AFTER ITS RUN ENDED.
      refused(() => actual.authorize(tool.token, PAIRS[1], 'tool'), 'revoked-token')
      t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ state: 'running' }), id)
      refused(() => actual.authorize(casting.token, PAIRS[0], 'casting'), 'revoked-token')
      refused(() => actual.authorize(tool.token, PAIRS[1], 'tool'), 'revoked-token')
    }
  })

  it('revokes both kinds on deletion in the same transaction, and a restore cannot revive either', () => {
    const id = run()
    const casting = actual.mint(id, 'casting', [PAIRS[0]], 1)
    const tool = actual.mint(id, 'tool', [PAIRS[1]], 1)
    t.api.deleteRecord(id, actor)
    for (const made of [casting, tool]) {
      expect(t.client.sqlite.prepare('SELECT revoked_at FROM run_tokens WHERE id = ?').get(made.id)).toMatchObject({ revoked_at: expect.any(Number) })
    }
    t.api.restoreRecord(id, actor)
    refused(() => actual.authorize(casting.token, PAIRS[0], 'casting'), 'revoked-token')
    refused(() => actual.authorize(tool.token, PAIRS[1], 'tool'), 'revoked-token')
  })

  it('revoke of the office identity key also takes back that runs router credential', async () => {
    const id = run()
    const keys = await import('../src/server/lib/keys.ts')
    const keyId = 'a-made-up-stop-key'
    t.client.sqlite.prepare('INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) VALUES (?, ?, ?, ?, ?)').run(keyId, 'agent', 'test-holder', keys.keyHash('a-made-up-identity-key'), '2026-10-25 01:30:00')
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.extra.runKeyId', ?) WHERE id = ?").run(keyId, id)
    const made = actual.mint(id, 'casting', PAIRS, 1)
    keys.revokeTheKeyNamed(keyId, 'test stop')
    refused(() => actual.authorize(made.token, PAIRS[0], 'casting'), 'revoked-token')
  })

  it('rolls record end, deletion and identity-key revocation back if credential revocation fails', async () => {
    const keys = await import('../src/server/lib/keys.ts')
    for (const operation of ['end', 'delete', 'stop']) {
      const id = run()
      const made = actual.mint(id, 'casting', PAIRS, 1)
      const keyId = `a-made-up-key-${operation}`
      t.client.sqlite.prepare('INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) VALUES (?, ?, ?, ?, ?)').run(keyId, 'agent', 'test-holder', keys.keyHash(keyId), '2026-10-25 01:30:00')
      t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.extra.runKeyId', ?) WHERE id = ?").run(keyId, id)
      const recordBefore = t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(id)
      const historyBefore = t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ?').all(id)
      t.client.sqlite.exec(`CREATE TRIGGER fail_run_token_revoke BEFORE UPDATE OF revoked_at ON run_tokens WHEN OLD.id = '${made.id}' BEGIN SELECT RAISE(ABORT, 'test revocation failure'); END`)
      const mutate = operation === 'end' ? () => t.api.patchRecord(id, { dataPatch: { state: 'crashed' } }, actor)
        : operation === 'delete' ? () => t.api.deleteRecord(id, actor) : () => keys.revokeTheKeyNamed(keyId, 'test stop')
      expect(mutate).toThrow()
      expect(t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(id)).toEqual(recordBefore)
      expect(t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ?').all(id)).toEqual(historyBefore)
      expect(t.client.sqlite.prepare('SELECT revoked_at FROM held_keys WHERE id = ?').get(keyId)).toEqual({ revoked_at: null })
      expect(actual.authorize(made.token, PAIRS[0], 'casting').runId).toBe(id)
      t.client.sqlite.exec('DROP TRIGGER fail_run_token_revoke')
    }
  })

  it('never places either kind of router token in office identity storage, records, revisions or exports', async () => {
    const id = run()
    const made = actual.mint(id, 'casting', [PAIRS[0]], 1)
    const tool = actual.mint(id, 'tool', [PAIRS[1]], 1)
    const keys = await import('../src/server/lib/keys.ts')
    for (const one of [made, tool]) {
      const hash = keys.keyHash(one.token)
      expect(t.client.sqlite.prepare('SELECT 1 FROM held_keys WHERE key_hash = ?').get(hash)).toBeUndefined()
      // The real identity verifier sees an unknown key, even under the office writer name.
      const { howThisRequestProvedItself } = keys
      const proof = howThisRequestProvedItself({ headers: { 'x-mole-office-key': one.token }, raw: { socket: { remoteAddress: '127.0.0.1' } } } as never)
      expect(proof).toBeUndefined()
    }
    for (const table of ['records', 'revisions', 'changes']) {
      const rows = JSON.stringify(t.client.sqlite.prepare(`SELECT * FROM ${table}`).all())
      for (const one of [made, tool]) expect(rows.includes(one.token)).toBe(false)
    }
    expect(t.client.schema.AUTHORED_TABLES.includes('run_tokens' as never)).toBe(false)
    expect(NOT_CARRIED_TABLES).toContain('run_tokens')
  })

  it('searches for token hashes and removes their bytes from a scrubbed copy', () => {
    const made = actual.mint(run(), 'casting', PAIRS, 1)
    const row = t.client.sqlite.prepare('SELECT token_hash FROM run_tokens WHERE id = ?').get(made.id) as { token_hash: string }
    const hashes = keyHashesACopyIsSearchedFor(t.client.sqlite)
    expect(hashes.has(row.token_hash)).toBe(true)
    const file = join(t.file.slice(0, t.file.lastIndexOf('/')), 'router-copy.db')
    t.client.sqlite.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(t.file, file)
    expect(hashesFoundInTheBytesOf(file, hashes)).toBeGreaterThan(0)
    const copy = new Database(file)
    emptyAndScrub(copy)
    expect(copy.prepare('SELECT * FROM run_tokens').all()).toEqual([])
    copy.close()
    expect(hashesLeftAfterAtMostOneRewrite(file, hashes, (path: string) => new Database(path, { readonly: true })).left).toBe(0)
    expect(readFileSync(file).includes(Buffer.from(row.token_hash))).toBe(false)
    expect(readFileSync(file).includes(Buffer.from(made.token))).toBe(false)
  })
})
