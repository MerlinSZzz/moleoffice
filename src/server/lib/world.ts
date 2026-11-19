// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY REPLY SAYS WHICH WORLD ANSWERED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G3 of design/ground/ACCEPTANCE.md. One hook puts one header on every reply this
 * server sends:
 *
 *     x-mole-office-world: db=<identity>; repo=<path>; port=<n>; head=<short>; standing=<canonical|scratch>
 *
 * The format is src/config/world-header.mjs and is written and read in that one place, because the
 * browser app, the session hook and the tools all have to read what this writes. The facts are
 * `worldNow()` in ./runtime.ts, which is what a resource row already carries, so a reply and a
 * ledger row say the same thing about the same server.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE CACHED FACT, AND WHY IT IS HONEST TO CACHE IT
 * ---------------------------------------------------------------------------------------
 *
 * `worldNow()` costs about 180 milliseconds: six `git` processes and one `ss`, measured in this
 * checkout on 3 September 2026. A header on every reply cannot pay that, so the world is read ONCE,
 * at the first reply this process sends, and the same five values go on every reply after it.
 *
 * That is not a cached reading of a changing thing. It is a reading of a fact that cannot change
 * while this process lives, and the header's meaning is written to match:
 *
 * - **The checkout** is found from the code's own location, so it is fixed for the process.
 * - **The port** is what this server was configured with, which it cannot change once it is up.
 * - **The database** is the file the open SQLite connection holds. A connection keeps the file it
 *   opened whatever anybody does to the path afterwards — which is exactly how this project once
 *   served an afternoon of data out of a deleted database — so the identity read when the
 *   connection was already open names the file that is really answering.
 * - **The commit** is the commit this process's code was loaded from. Somebody checking out
 *   another commit does not change what this process is running, so the header would be WRONG to
 *   move: the reply really did come from the older code. Whether the checkout has moved ahead is a
 *   different question, it is criterion G6's, and `GET /api/runtime/freshness` is what answers it.
 * - **Standing** follows from those four.
 *
 * `GET /api/runtime` still reads everything fresh, every time, as G2 requires. This header and that
 * route are one implementation read at two moments, not two implementations.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS. IT NEVER SIGNALS, WRITES OR REPAIRS.
 * ---------------------------------------------------------------------------------------
 *
 * Putting a header on a reply must be safe on somebody else's stack, and a failure to work out the
 * world must never cost a caller their answer. So a world that cannot be read leaves the fields
 * that could not be read saying `unknown`, and the reply goes out as it would have anyway.
 */

import { resolve } from 'node:path'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  UNKNOWN,
  WORLD_HEADER,
  formatWorldHeader,
  type WorldOnTheWire,
} from '../../config/world-header.mjs'
import {
  FRESHNESS_HEADER,
  formatFreshnessHeader,
  howLongStale,
  type FreshnessOnTheWire,
} from '../../config/freshness-header.mjs'
import { THE_DEVELOPMENT_CHECKOUT, settingValue } from '../../config/settings.mjs'
import { localStamp, parseStoredStamp } from '@shared/time.ts'
import { Gaps, theServersFreshness } from './runtime.ts'
// The database's identity is worked out in src/config/database-identity.mjs and nowhere else,
// because `tools/session-hook.mjs` has to work out the same id for the database the declaration
// calls canonical, and it runs on a Node that cannot read TypeScript.
import { databaseIdentity } from '../../config/database-identity.mjs'
import type { World } from '@shared/runtime.ts'
import { databaseFileStatus, sqlite } from '../db/client.ts'
import { installationOf } from '../db/citizenship-migration.ts'
import { worldNow } from './runtime.ts'

export { databaseIdentity }

/**
 * THE WORLD THIS PROCESS ANSWERS IN, HELD ON THE PROCESS AND KEYED BY THE DATABASE.
 *
 * The header block above says why reading these five facts once is a reading of something fixed
 * rather than a cached reading of something that moves.
 *
 * TWO THINGS ABOUT HOW IT IS HELD, both of them measured rather than chosen for tidiness.
 *
 * 1. **On `globalThis`, not in a module variable.** The test runner gives every test a fresh module
 *    graph (`vi.resetModules()` in `tests/helpers.ts`), so a module variable would be empty again
 *    for each of the ten thousand tests, and each of them would run git. What is held is a fact
 *    about the PROCESS, and the process outlives the module graph, so this is where it belongs.
 * 2. **Keyed by the database file.** That is the one of the five that can change inside a living
 *    process, and only under the test runner, which opens a throwaway database per test. When the
 *    key changes the world is read again; when it does not, the held answer is the same answer.
 */
const HELD = Symbol.for('mole-office.the-world-this-process-answers-in')

interface Held {
  databasePath: string
  world: WorldOnTheWire
  /**
   * The same reading in full, because two readers want different parts of it.
   *
   * The header wants five strings. `GET /api/health` wants `standing.because` — the plain reasons a
   * runtime is scratch — and reading them again would mean running `git` on every health check,
   * which `worldNow()` was measured at 180 milliseconds for. It is the same reading, kept once.
   */
  full: World
}

function heldWorld(): Held | null {
  return ((globalThis as Record<symbol, unknown>)[HELD] as Held | undefined) ?? null
}

/** Forget the world, so the next reply reads it again. For a test that changes what it should be. */
export function forgetTheWorld(): void {
  ;(globalThis as Record<symbol, unknown>)[HELD] = null
}

/** The five facts this server puts on every reply. */
export function theWorldThisProcessAnswersIn(): WorldOnTheWire {
  return readTheWorldOnce().world
}

/**
 * The same reading, in full, for a caller that wants more than the five strings.
 *
 * `GET /api/health` is the one, and what it wants is `standing.because`: the plain sentences saying
 * why a runtime is scratch. It reports them as the reason it is not answering healthy.
 */
export function theWorldThisProcessIsIn(): World {
  return readTheWorldOnce().full
}

function readTheWorldOnce(): Held {
  const databasePath = resolve(databaseFileStatus().path)
  const held = heldWorld()
  if (held !== null && held.databasePath === databasePath) return held
  const world = worldNow()
  if (THE_DEVELOPMENT_CHECKOUT !== null) world.developmentCheckout = THE_DEVELOPMENT_CHECKOUT
  const wire: WorldOnTheWire = {
    ...(world.developmentCheckout === undefined ? {} : { developmentCheckout: world.developmentCheckout }),
    // `worldNow` has already worked the identity out from the file it opened. Reading it again here
    // would be the same fact worked out twice, and `database` is null exactly when it could not be.
    database: world.databaseIdentity ?? UNKNOWN,
    repository: world.repository,
    port: world.port === null ? UNKNOWN : String(world.port),
    head: world.head ?? UNKNOWN,
    standing: world.standing.kind,
  }
  const now = { databasePath, world: wire, full: world } satisfies Held
  ;(globalThis as Record<symbol, unknown>)[HELD] = now
  return now
}

/**
 * THE IDENTITY OF THE WORLD THIS DATABASE IS, or null because it could not be read.
 *
 * The same reading the world header carries, asked for the one fact a citizenship needs: a world is
 * one running Mole Office with one database, and its identity is that database's identity. It is
 * read through `theWorldThisProcessAnswersIn` rather than by hashing the file again, so a row
 * written here and the header on the reply that wrote it cannot disagree about which world this is.
 *
 * NULL IS A REAL ANSWER. `unknown` on the header means the file could not be read, or the filesystem
 * records no creation time for it; either way there is no identity, and a row is left without a home
 * world rather than given an invented one. Criterion C1 of design/messages/ACCEPTANCE.md section 8.
 */
export function theWorldThisDatabaseIs(): string | null {
  const said = theWorldThisProcessAnswersIn().database
  return said === UNKNOWN ? null : said
}

/**
 * WHICH INSTALLATION THIS DATABASE SAYS IT BELONGS TO, or null because nothing has written it.
 *
 * Read from the database's own row rather than worked out from the declaration, because the two are
 * different questions and only the first one is about this database. The row is written once, by
 * `migrateCitizenship`, and never rewritten: see src/server/db/citizenship-migration.ts.
 */
export function theInstallationThisDatabaseBelongsTo(): string | null {
  return installationOf(sqlite)
}

/**
 * A WORLD SOMEBODY ELSE READ OFF A REPLY, TURNED INTO THE SHAPE A LEDGER ROW HOLDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G5: every registered process says which world it serves. Until now only a Mole Office
 * API could record one, because only it could read its own checkout and database. Everything else
 * — a Vite, an agent's server, anything registered through `POST /api/resources` — got `world:
 * null`, so not one row on the canonical ledger carried a world, the owner's own two processes
 * included. Problem `oRrML6lgPNnr`.
 *
 * What everything else CAN read is the world header on a reply from the Mole Office it serves. That
 * is five strings, and this turns them into the record a row holds.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS LOST ON THE WAY, AND SAID RATHER THAN GUESSED
 * ---------------------------------------------------------------------------------------
 *
 * The header carries the database as an IDENTITY and not a path, on purpose — see the top of
 * src/config/world-header.mjs. So `database` comes back null and `databaseIdentity` carries the
 * sixteen characters. A path invented from an identity would be a guess about a file.
 *
 * The header carries `standing` as one word and not its reasons, so `because` says exactly that.
 * An empty `because` would read as "canonical, and there was nothing to say", which is a different
 * sentence.
 *
 * `saidBy` records that this world was read off a reply rather than by the process about itself.
 * They are not equally strong claims and a reader is told which one this is.
 *
 * @param wire the five strings, already parsed by `parseWorldHeader`
 * @param saidBy how the caller came by them, in one plain phrase
 */
export function theWorldThatHeaderDescribes(wire: WorldOnTheWire, saidBy: string): World {
  const port = /^\d+$/.test(wire.port) ? Number(wire.port) : null
  const scratch = wire.standing !== 'canonical'
  const developmentCheckout = (wire as WorldOnTheWire & { developmentCheckout?: string }).developmentCheckout
  return {
    ...(typeof developmentCheckout === 'string' && developmentCheckout !== '' ? { developmentCheckout } : {}),
    repository: wire.repository === UNKNOWN ? '' : wire.repository,
    database: null,
    databaseIdentity: wire.database === UNKNOWN ? null : wire.database,
    port,
    head: wire.head === UNKNOWN ? null : wire.head,
    standing: {
      kind: scratch ? 'scratch' : 'canonical',
      because: scratch
        ? ['the world header said scratch, and a header does not carry the reasons']
        : [],
    },
    readAt: localStamp(new Date()),
    saidBy,
  }
}

/**
 * HOW OLD THIS SERVER'S OWN CODE IS, AND HOW LONG IT HAS BEEN THAT OLD.
 *
 * The server's half of the `freshness()` the runtime record reports, turned into the three values
 * that travel on a header. `theServersFreshness` reads only that half, because the page's half is not
 * on the header. Nothing here is held between replies. The look at the server's files under it is
 * read again for as long as the rule above `theServersHalf` in src/server/lib/runtime.ts says, so a
 * save is found at the next look rather than at the next reply.
 *
 * HOW LONG comes from `staleSince`, which is the moment this process was FIRST FOUND behind the
 * checkout. Subtracting it from now is a count this server makes, so the page never has to agree
 * with this machine about the clock.
 *
 * IT USED TO BE THE MODIFICATION TIME OF THE NEWEST FILE, and that is the last change rather than
 * the first one after this process loaded. Every save restarted the count, so a server that had
 * been behind for an hour reported three seconds while somebody was working and nothing here ever
 * exceeded the grace. Problem `PxJuVufHG6A2`; the clock is in src/server/lib/runtime.ts.
 *
 * THE GRACE IS THE DECLARATION'S. It travels because the page cannot read the declaration at all:
 * src/config/settings.mjs imports node:fs. A number the page held its own copy of would be one
 * setting in two places, free to disagree.
 */
export function howOldThisServersCodeIs(): FreshnessOnTheWire {
  const grace = Number(settingValue('MOLE_OFFICE_STALE_CODE_GRACE'))
  const reading = theServersFreshness(new Gaps())
  if (reading.verdict === 'as new as the checkout') return { verdict: 'fresh', staleFor: null, grace }
  if (reading.verdict === 'unknown') return { verdict: 'unknown', staleFor: null, grace }
  const since = reading.staleSince === null ? null : parseStoredStamp(reading.staleSince)
  return {
    verdict: 'stale',
    // Null when the moment it went stale could not be read. That is not zero: zero would say "it
    // has just gone stale", which is the reading that keeps a banner off the screen.
    staleFor: since === null ? null : Math.floor((Date.now() - since) / 1000),
    grace,
  }
}

/**
 * THE TWO HEADERS EVERY REPLY CARRIES: which world answered, and how old this server's code is.
 *
 * Exported because a held-open reply cannot use the hook below. `reply.hijack()` takes the reply
 * out of Fastify's hands, so the `onSend` hook never runs on it, and the stream at GET /api/events
 * sets these on the raw response itself. Both callers read the same function, so a stream cannot
 * start saying a different world from every other reply.
 */

/**
 * Put the world on every reply this server sends.
 *
 * EVERY reply, not only the ones under `/api`. The criterion is *every reply says which world
 * answered*, and in production this same process serves the browser app's own files: a page fetched
 * from the wrong world is the state that started all this, so the page's own request says which
 * world sent it too.
 *
 * A FAILURE HERE COSTS NOBODY THEIR ANSWER. Working out the world reads a file and, once, runs
 * git; if any of that throws, the reply goes out without the header rather than not at all, and a
 * missing header is a state every reader of this already handles — `parseWorldHeader` refuses it in
 * words, the session hook will not file against it, and the browser app draws its banner.
 */
export function whichWorldAnswered(): Record<string, string> {
  return {
    [WORLD_HEADER]: formatWorldHeader(theWorldThisProcessAnswersIn()),
    // AND HOW OLD THIS SERVER'S OWN CODE IS, worked out for each reply from the last look at the
    // server's files, which the rule above `theServersHalf` in src/server/lib/runtime.ts reads again
    // for a time. The header block of src/config/freshness-header.mjs says why this one cannot be
    // held for the life of the process the way the world is, and what it costs to read.
    [FRESHNESS_HEADER]: formatFreshnessHeader(howOldThisServersCodeIs()),
  }
}

export function sayWhichWorldAnswered(app: FastifyInstance): void {
  app.addHook('onSend', async (_req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    try {
      for (const [name, value] of Object.entries(whichWorldAnswered())) reply.header(name, value)
    } catch {
      // Catching to the letter of invariant 4: what is handled here is "this reply cannot say which
      // world it came from", and what is done about it is to send the reply without the header,
      // which every reader treats as a refusal rather than as a match. Nothing is hidden: the same
      // failure is reported in full, with its reason, by GET /api/runtime.
    }
    return payload
  })
}
