// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Host/internal credential service. The provider router's doors (api/provider-router.ts) reach mint,
 * replace, current, authorize and charge, each after proving who asks; revoke has no door. A router
 * token grants no office identity.
 *
 * TWO KINDS OF ROW, ONE RUN. `casting` is the credential the run's bridge sends for the pair its Casting row gave the
 * run. `tool` is the one credential a tool mints with the run's own key for the single pair it asks for. Each row has
 * its own hash, pair, expiry and kind; both spend the run's one cap, kept on the same total in every row so neither
 * can spend it twice. A token is checked at its own door only: a Casting token is refused at the tool route and a tool
 * token is refused at the Casting admission door.
 *
 * Only mint and replace return a secret, once. Every other answer and every stored row omits it.
 * Epoch milliseconds are UTC instants, independent of the office's display clock and time zone.
 * spendCap, spent and charge amounts are USD, including fractional dollars.
 */
import { createHash, randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'

export const RUN_TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000
export const RUN_TOKEN_KINDS = ['casting', 'tool'] as const
export type RunTokenKind = (typeof RUN_TOKEN_KINDS)[number]
export const RUN_TOKEN_REFUSALS = {
  'invalid-token': 'The router credential is not valid.',
  'revoked-token': 'The router credential has been revoked.',
  'expired-token': 'The router credential has expired.',
  'run-not-live': 'The router credential requires a live run.',
  'run-already-has-token': 'This run already has a router credential of this kind. Replace its current credential.',
  'pair-not-allowed': 'The router credential does not allow this provider and model together.',
  'cap-reached': 'The run has reached its spending cap.',
  'invalid-policy': 'The router credential requires provider and model pairs and a finite nonnegative spending cap.',
  'invalid-spend': 'The spend must be finite and nonnegative, including the accumulated amount.',
  'invalid-clock': 'The credential clock must name a valid UTC instant.',
  'invalid-kind': 'The credential kind must be casting or tool.',
  'casting-token-at-tool-door': 'This is the run\'s Casting credential, and the tool route may not use it.',
  'tool-token-at-casting-door': 'This is a tool credential, and the run\'s bridge may not use it.',
} as const
type Refusal = keyof typeof RUN_TOKEN_REFUSALS

export class RunTokenError extends Error {
  constructor(readonly code: Refusal, readonly kind: RunTokenKind | null = null) {
    super(RUN_TOKEN_REFUSALS[code])
    this.name = 'RunTokenError'
  }
}

export interface RunTokenPair { provider: string; model: string }
type RunRevocation = 'run-ended' | 'run-deleted' | 'run-changed' | 'identity-key-revoked'
interface CredentialRow {
  id: string
  run_id: string
  kind: RunTokenKind
  token_hash: string
  allowed_pairs: string
  spend_cap: number
  spent: number
  issued_at: number
  expires_at: number
  revoked_at: number | null
}
export interface IssuedRunToken {
  id: string
  runId: string
  kind: RunTokenKind
  token: string
  issuedAt: number
  expiresAt: number
  spendCap: number
  spent: number
}

function refuse(code: Refusal, kind: RunTokenKind | null = null): never { throw new RunTokenError(code, kind) }
function finiteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
function theKind(value: unknown): RunTokenKind {
  if (value === 'casting' || value === 'tool') return value
  return refuse('invalid-kind')
}
function pair(value: unknown): value is RunTokenPair {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const p = value as Record<string, unknown>
  return Object.keys(p).length === 2 &&
    typeof p.provider === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(p.provider) &&
    typeof p.model === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/.test(p.model)
}
function policy(pairs: unknown, cap: unknown): string {
  if (!finiteNonnegative(cap) || !Array.isArray(pairs) || pairs.length === 0 || pairs.length > 256 || !pairs.every(pair)) refuse('invalid-policy')
  // Copy the policy now: mutating the caller's array cannot widen a credential later.
  return JSON.stringify(pairs.map(p => ({ provider: p.provider, model: p.model })))
}
function hash(token: string): string {
  // A separate hash domain as well as a separate table from office identity keys.
  return createHash('sha256').update('router-run-token\0').update(token).digest('hex')
}

/** The database and clock are explicit so tests require no keys, real files or moving clocks. */
export function createRunTokenStore(sqlite: Database.Database, clock: () => number = Date.now) {
  function instant(): number {
    const at = clock()
    if (!Number.isSafeInteger(at) || at < 0 || at > 8.64e15 - RUN_TOKEN_LIFETIME_MS) refuse('invalid-clock')
    return at
  }
  function liveRun(runId: unknown): asserts runId is string {
    if (typeof runId !== 'string' || runId.length === 0 || runId.length > 256) refuse('run-not-live')
    const row = sqlite.prepare('SELECT kind, data, deleted_at FROM records WHERE id = ?').get(runId) as
      { kind: string; data: string; deleted_at: string | null } | undefined
    if (row === undefined || row.kind !== 'session' || row.deleted_at !== null) refuse('run-not-live')
    let data: unknown
    try { data = JSON.parse(row.data) } catch { refuse('run-not-live') }
    const state = data !== null && typeof data === 'object' ? (data as Record<string, unknown>).state : undefined
    if (state !== 'running' && state !== 'idle') refuse('run-not-live')
  }
  function byId(id: unknown): CredentialRow {
    if (typeof id !== 'string' || !/^rt_[A-Za-z0-9_-]{24}$/.test(id)) refuse('invalid-token')
    const row = sqlite.prepare('SELECT * FROM run_tokens WHERE id = ?').get(id) as CredentialRow | undefined
    if (row === undefined) refuse('invalid-token')
    return row
  }

  /**
   * THE RUN'S ONE LEDGER: the most any row says the run has spent, and the cap its first row set. Every charge writes
   * that one total into every row of the run, so a row minted later starts where the run stands and the two kinds
   * cannot each spend the full cap.
   */
  function runTerms(runId: string): { spent: number; spendCap: number | null } {
    const rows = sqlite.prepare('SELECT spend_cap, spent FROM run_tokens WHERE run_id = ? ORDER BY issued_at, rowid').all(runId) as
      { spend_cap: number; spent: number }[]
    let spent = 0
    for (const row of rows) spent = Math.max(spent, row.spent)
    return { spent, spendCap: rows.length === 0 ? null : rows[0]!.spend_cap }
  }

  /** THE RUN'S EXPIRY, read off its live Casting credential, which the bridge holds for the run. */
  function theRunsExpiry(runId: string): number | undefined {
    const row = sqlite.prepare(
      "SELECT expires_at FROM run_tokens WHERE run_id = ? AND kind = 'casting' AND revoked_at IS NULL ORDER BY issued_at DESC, rowid DESC LIMIT 1",
    ).get(runId) as { expires_at: number } | undefined
    return row?.expires_at
  }

  function issue(runId: string, kind: RunTokenKind, pairs: string, spendCap: number, spent: number, at: number): IssuedRunToken {
    const token = `mrt_${randomBytes(32).toString('base64url')}`
    const id = `rt_${randomBytes(18).toString('base64url')}`
    const notAfter = kind === 'tool' ? theRunsExpiry(runId) : undefined
    const expiresAt = notAfter === undefined ? at + RUN_TOKEN_LIFETIME_MS : Math.min(at + RUN_TOKEN_LIFETIME_MS, notAfter)
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= at) refuse('expired-token', kind)
    sqlite.prepare(
      'INSERT INTO run_tokens (id, run_id, kind, token_hash, allowed_pairs, spend_cap, spent, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, runId, kind, hash(token), pairs, spendCap, spent, at, expiresAt)
    return { id, runId, kind, token, issuedAt: at, expiresAt, spendCap, spent }
  }

  return {
    /** First issue of one kind only. Token history is never a way to reset or widen a run's policy. */
    mint(runId: string, kindAsked: RunTokenKind, pairs: readonly RunTokenPair[], spendCap: number): IssuedRunToken {
      const kind = theKind(kindAsked)
      const allowed = policy(pairs, spendCap)
      return sqlite.transaction(() => {
        liveRun(runId)
        if (sqlite.prepare('SELECT 1 FROM run_tokens WHERE run_id = ? AND kind = ? LIMIT 1').get(runId, kind) !== undefined) {
          refuse('run-already-has-token', kind)
        }
        const terms = runTerms(runId)
        return issue(runId, kind, allowed, terms.spendCap ?? spendCap, terms.spent, instant())
      }).immediate()
    },

    /** Expiry is never updated. Replacing an expired current token is allowed on a live run. */
    replace(id: string): IssuedRunToken {
      return sqlite.transaction(() => {
        const old = byId(id)
        if (old.revoked_at !== null) refuse('revoked-token', old.kind)
        liveRun(old.run_id)
        const at = instant()
        const terms = runTerms(old.run_id)
        sqlite.prepare("UPDATE run_tokens SET revoked_at = ?, revoked_because = 'replaced' WHERE id = ?").run(at, old.id)
        return issue(old.run_id, old.kind, old.allowed_pairs, old.spend_cap, terms.spent, at)
      }).immediate()
    },

    /** The run's one unrevoked credential of this kind, without its secret, or null when it has none. */
    current(runId: string, kindAsked: RunTokenKind): {
      id: string; kind: RunTokenKind; pairs: RunTokenPair[]; spendCap: number; spent: number; issuedAt: number; expiresAt: number
    } | null {
      const kind = theKind(kindAsked)
      const row = sqlite.prepare(
        'SELECT id, kind, allowed_pairs, spend_cap, spent, issued_at, expires_at FROM run_tokens WHERE run_id = ? AND kind = ? AND revoked_at IS NULL',
      ).get(runId, kind) as
        Pick<CredentialRow, 'id' | 'kind' | 'allowed_pairs' | 'spend_cap' | 'spent' | 'issued_at' | 'expires_at'> | undefined
      if (row === undefined) return null
      return {
        id: row.id, kind: row.kind, pairs: JSON.parse(row.allowed_pairs) as RunTokenPair[],
        spendCap: row.spend_cap, spent: runTerms(runId).spent, issuedAt: row.issued_at, expiresAt: row.expires_at,
      }
    },

    /** Read-only. The returned id is a charge handle for an admitted request, never a credential. */
    authorize(token: string, requested: RunTokenPair, kindAsked: RunTokenKind = 'casting'): {
      id: string; runId: string; kind: RunTokenKind; spent: number; spendCap: number
    } {
      const kind = theKind(kindAsked)
      if (typeof token !== 'string' || !/^mrt_[A-Za-z0-9_-]{43}$/.test(token)) refuse('invalid-token')
      const row = sqlite.prepare('SELECT * FROM run_tokens WHERE token_hash = ?').get(hash(token)) as CredentialRow | undefined
      if (row === undefined) refuse('invalid-token')
      if (row.revoked_at !== null) refuse('revoked-token', row.kind)
      liveRun(row.run_id)
      if (instant() >= row.expires_at) refuse('expired-token', row.kind)
      if (row.kind !== kind) {
        refuse(row.kind === 'casting' ? 'casting-token-at-tool-door' : 'tool-token-at-casting-door', row.kind)
      }
      const allowed = JSON.parse(row.allowed_pairs) as RunTokenPair[]
      if (!pair(requested) || !allowed.some(p => p.provider === requested.provider && p.model === requested.model)) {
        refuse('pair-not-allowed', row.kind)
      }
      const terms = runTerms(row.run_id)
      if (terms.spent >= row.spend_cap) refuse('cap-reached', row.kind)
      return { id: row.id, runId: row.run_id, kind: row.kind, spent: terms.spent, spendCap: row.spend_cap }
    },

    /**
     * Read-only, FOR A REQUEST THAT NAMES NO MODEL: a credential that allows exactly one provider and model, checked for
     * its end, its run and its cap, answers the pair it allows. A credential naming more than one pair is refused
     * rather than guessed at, so a tool never widens what it may ask for by asking a path that names no model.
     */
    authorizeForProvider(token: string, provider: string, kindAsked: RunTokenKind = 'casting'): {
      id: string; runId: string; kind: RunTokenKind; provider: string; model: string; spent: number; spendCap: number
    } {
      const kind = theKind(kindAsked)
      if (typeof token !== 'string' || !/^mrt_[A-Za-z0-9_-]{43}$/.test(token)) refuse('invalid-token')
      const row = sqlite.prepare('SELECT * FROM run_tokens WHERE token_hash = ?').get(hash(token)) as CredentialRow | undefined
      if (row === undefined) refuse('invalid-token')
      if (row.revoked_at !== null) refuse('revoked-token', row.kind)
      liveRun(row.run_id)
      if (instant() >= row.expires_at) refuse('expired-token', row.kind)
      if (row.kind !== kind) {
        refuse(row.kind === 'casting' ? 'casting-token-at-tool-door' : 'tool-token-at-casting-door', row.kind)
      }
      const allowed = JSON.parse(row.allowed_pairs) as RunTokenPair[]
      if (allowed.length !== 1 || !pair(allowed[0]!) || allowed[0]!.provider !== provider) refuse('pair-not-allowed', row.kind)
      const terms = runTerms(row.run_id)
      if (terms.spent >= row.spend_cap) refuse('cap-reached', row.kind)
      const only = allowed[0]!
      return {
        id: row.id, runId: row.run_id, kind: row.kind, provider: only.provider, model: only.model,
        spent: terms.spent, spendCap: row.spend_cap,
      }
    },

    /**
     * Host/router-only settlement of an admitted request. A provider's final cost can arrive after
     * expiry, replacement or revocation, and can exceed the cap. All rows of the run share that one spend, in one
     * transaction: the charge is read from the run's total and written to every row, so no charge is lost and the two
     * kinds cannot each hold the full cap. The caller must settle each receipt once; provider receipt ingestion belongs
     * to the router.
     */
    charge(id: string, amount: number): { kind: RunTokenKind; spent: number } {
      if (!finiteNonnegative(amount)) refuse('invalid-spend')
      return sqlite.transaction(() => {
        const row = byId(id)
        const spent = runTerms(row.run_id).spent + amount
        if (!finiteNonnegative(spent)) refuse('invalid-spend')
        sqlite.prepare('UPDATE run_tokens SET spent = ? WHERE run_id = ?').run(spent, row.run_id)
        return { kind: theKind(row.kind), spent }
      }).immediate()
    },

    revoke(id: string): boolean {
      return sqlite.transaction(() => {
        const row = byId(id)
        if (row.revoked_at !== null) return false
        return sqlite.prepare("UPDATE run_tokens SET revoked_at = ?, revoked_because = 'explicit' WHERE id = ? AND revoked_at IS NULL").run(instant(), id).changes > 0
      }).immediate()
    },

    /** Called inside the record/identity-key transaction; never stores caller-supplied prose. Both kinds go together. */
    revokeRun(runId: string, because: RunRevocation): number {
      if (!['run-ended', 'run-deleted', 'run-changed', 'identity-key-revoked'].includes(because)) refuse('invalid-policy')
      if (typeof runId !== 'string' || runId.length === 0 || runId.length > 256) refuse('run-not-live')
      return sqlite.transaction(() => sqlite.prepare(
        'UPDATE run_tokens SET revoked_at = ?, revoked_because = ? WHERE run_id = ? AND revoked_at IS NULL',
      ).run(instant(), because, runId).changes).immediate()
    },
  }
}
