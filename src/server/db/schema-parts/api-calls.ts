// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

// ------------------------------------------------------------------- what Mole Office measured of itself

/**
 * ONE ROW PER REQUEST MOLE OFFICE ANSWERED.
 *
 * MEASURED — a third class beside authored and derived, and both of the other two would be a lie the
 * schema then acts on. Nobody WROTE a telemetry row; the server answered a request, so it is not
 * authored. Nothing can rebuild one, so calling it derived would put a sentence in an archive's
 * README telling a restorer these tables come back, and they never would.
 *
 * WHAT THAT CLASS BUYS. The guards that ask "does this database hold work" read the authored list,
 * so a fresh developer database with two hundred telemetry rows and no work in it still answers
 * zero, and the guard that reads a shrinking table as loss does not read a legitimate prune as one.
 *
 * NO URL AND NO QUERY STRING IS EVER STORED HERE. A record id is a reference; a query string is
 * content somebody typed. That rule is on THIS table, where a URL could actually land.
 *
 * `at_ms` IS EPOCH MILLISECONDS AND IS THE ONE DEPARTURE FROM THE LOCAL-WALL-CLOCK RULE in this
 * database. Sub-second order is what makes a sequence of calls readable, and the human stamp is made
 * at read time by the one reader in src/shared/time.ts, so there is still one writer of that string.
 */
export const apiCalls = aPartTable(sqliteTable(
  'api_calls',
  {
    /** nanoid, like every other id here, so a finding can cite one row. */
    id: text('id').primaryKey(),
    /** The instant, as epoch milliseconds. */
    atMs: integer('at_ms').notNull(),
    /**
     * The semantic operation. NULL means no route matched — a 404 — and NULL is the honest answer.
     *
     * Named `operation` and not `op`, because `changes.op` already exists and means create / update /
     * delete / link / unlink. Two columns called `op` meaning different things in one database is a
     * name collision waiting for a wrong join.
     */
    operation: text('operation'),
    /** `read` or `write`, as the route declared it. Stored, so a trace's arithmetic never depends on the live route table. */
    effect: text('effect'),
    /** The route pattern, e.g. `/api/records/:id`. NULL on a 404. */
    route: text('route'),
    /** `GET`, `POST`, and the rest. On a 404 it is the only thing left. */
    method: text('method').notNull(),
    /** 1 where the route declared itself a long poll. A four-minute wait in a latency median makes every median a lie. */
    waits: integer('waits').notNull().default(0),
    /** What the caller got. Success, refusal and failure are read off this; storing an outcome word would be the same fact twice. */
    status: integer('status').notNull(),
    /** How long it took, as Fastify reports it. Latency cannot be recovered later. */
    ms: real('ms').notNull(),
    /** Response payload size. NULL when the payload was not a string or a buffer. */
    bytes: integer('bytes'),
    /**
     * The length of the longest array sitting directly on the response object, or of the response
     * itself when it is an array; NULL when it has none. A stated rule, not an interpretation of the
     * reply. It separates "this read returned nothing" from "this read returned four hundred things".
     */
    listLen: integer('list_len'),
    /** The project the request resolved to. */
    workspaceId: text('workspace_id'),
    /**
     * 1 when the caller named the project, 0 when it took the default, NULL when the route resolves
     * none. Without it a bare curl and a deliberate claim on the default project are the same row.
     */
    workspaceStated: integer('workspace_stated'),
    /** WHAT THE CALLER SAID it was: `human`, `agent`, `system` or NULL. Never used to decide what to count. */
    actorType: text('actor_type'),
    /** Which agent or person, as the caller said. */
    actorId: text('actor_id'),
    /** The run, from the session header. The join to the `session` record. */
    sessionId: text('session_id'),
    /**
     * `key`, `checked`, `header` or `none`. Four values distinguish proved from unverified identity.
     * `key` = the request carried a key the office knows, so the caller proved itself. `checked` = a
     * handler asked who this was and it passed every refusal, with no key. `header` = the headers
     * were there and nothing validated them, which is every ordinary read. `none` = nobody said.
     * Without the fourth, an analysis would mix a proved identity with an unverified one silently.
     */
    identitySource: text('identity_source').notNull(),
    /** Which piece of work this call belongs to. NULL means the caller did not say, which is a real answer. */
    traceId: text('trace_id'),
    /** Why, out of the closed list. NULL means the caller did not say. */
    purpose: text('purpose'),
    /** The value of the route's outer path parameter. A reference and nothing else. */
    targetId: text('target_id'),
    /** What kind of thing that id names, as the route declared it. NULL when the route has no parameter. */
    targetKind: text('target_kind'),
    /**
     * The network address the request came from. It is the only value in this table that names a
     * machine. NULL only if a request ever reaches the hook with no socket, and NULL there is honest
     * absence rather than a guess of loopback.
     *
     * It is not called `origin`: `records.origin` already exists and means how a row entered the
     * corpus, and a second `origin` would be the `op` collision this table already refused.
     */
    clientAddr: text('client_addr'),
    /**
     * `local` or `remote`, FROM WHICH LISTENER ACCEPTED THE CONNECTION, not from the address. NULL
     * means recorded before Mole Office could tell, and is never read as `local`.
     *
     * A remote call can arrive through a proxy on a loopback listener, so the address alone cannot
     * identify its origin. The listener sets this socket fact before any hook runs, and nothing can
     * recover it afterwards.
     */
    clientOrigin: text('client_origin'),
  },
  (t) => [
    // SEVEN, AND EACH IS PAID FOR IN BYTES PER ROW, which is what this table's whole design is about.
    // The first three are by time, by trace and by operation. The fourth is there because two usage doors,
    // `GET /api/usage/operations` and `GET /api/usage/patterns`, count one project's rows grouped by
    // operation, and without it they were slow under load. It holds every column those queries read,
    // so SQLite reads the index alone and never the table. src/server/lib/usage-reads.ts names it in
    // both queries. It holds only rows
    // with an operation, so SQLite uses it only for a query that says so; the other reads of this
    // table that name a project keep their plans. Migration 0184 says why in full. The fifth holds only
    // remote calls, so `clientsFromOtherMachines` in the same file reads it instead of every row.
    // Migration 0227 has the measurements. The sixth is by run and then time, so reads using
    // `session_id` can search for a run's timeline, latest calls and start steps. Migration 0322 has
    // the measurements. The seventh is by actor type, actor id, address and time, so `machinesSeenFrom`
    // in src/server/lib/participants.ts searches one participant's calls instead of reading every row.
    // It holds only calls with an address, so it is paid for on each of those, and SQLite uses it only
    // for a query whose WHERE implies `client_addr IS NOT NULL`: that term itself, or a comparison of
    // `client_addr` with a value. No other read of this table does either. Migration 0355 says why.
    index('api_calls_at_idx').on(t.atMs),
    index('api_calls_trace_idx').on(t.traceId, t.atMs),
    index('api_calls_operation_idx').on(t.operation, t.atMs),
    index('api_calls_workspace_operation_idx').on(
      t.workspaceId,
      t.operation,
      t.actorId,
      t.bytes,
      t.atMs,
      t.status,
      t.effect,
      t.waits,
      t.ms,
      t.targetId,
    ).where(sql`operation IS NOT NULL`),
    index('api_calls_from_other_machines_idx').on(t.clientAddr, t.atMs).where(sql`client_origin = 'remote'`),
    index('api_calls_session_at_idx').on(t.sessionId, t.atMs),
    index('api_calls_actor_address_idx').on(t.actorType, t.actorId, t.clientAddr, t.atMs).where(sql`client_addr IS NOT NULL`),
  ],
), { existingMeasured: true })
