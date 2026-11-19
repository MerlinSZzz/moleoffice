// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE: WHICH WORLDS THERE ARE, AND THE FILE THAT MIRRORS THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion C2 of design/messages/ACCEPTANCE.md section 8: a bridge, like a foreign affairs office in
 * real life. One desk, in one world, that answers which worlds there are and where a trip is
 * registered, with what the trip is for.
 *
 * A world is one running Mole Office with one database, and its identity is that database's
 * identity. `src/shared/worlds.ts` holds the vocabulary; this holds the rows.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH DATABASE HOLDS THE OFFICE, AND HOW THAT IS DECIDED
 * ---------------------------------------------------------------------------------------
 *
 * There is one schema and one migration folder, so the `worlds` table is created in every database
 * that is migrated. Every world writes its own birth into its own table, because a world always
 * knows about itself even when it can reach nothing else.
 *
 * THE OFFICE IS THE DATABASE HOLDING A WORLD OF KIND `home`. That is one rule, read from the rows,
 * and `theOfficeIsInThisDatabase()` below is the only place it is asked. A server registers
 * itself as `home` exactly when its own standing is canonical — which is the declaration's answer,
 * worked out by `standing()` in lib/runtime.ts — so the world the declaration calls canonical is
 * the office and nothing else can become one by accident.
 *
 * WHY NOT "THE DATABASE PATH THE DECLARATION CALLS CANONICAL", WHICH IS THE SHORTER SENTENCE. It is
 * the same answer in every real installation and it cannot be reached in a test: the declaration is
 * read from `.env` and ignores the shell, on purpose, so a test database can never be the one it
 * names. A rule nothing can exercise is a rule nothing protects. Reading it from the rows keeps the
 * same meaning, is exercised by the suite, and puts the decision where the history already is.
 *
 * ---------------------------------------------------------------------------------------
 * THE MIRROR
 * ---------------------------------------------------------------------------------------
 *
 * `data/worlds.json`, written by the main world after every change, so a world can still read the
 * office when the main world does not answer. It carries the worlds AND the open visits, because the
 * office is both and the second is what a visited world reads on every request. It says when it was written, because a reader of a
 * mirror is reading what was true when the main world last spoke, and a copy with no date on it
 * would be read as the present.
 *
 * IT LIVES BESIDE THE CANONICAL DATABASE, not beside this process's own. Every world of one
 * installation has to read the same file, and the canonical database path is the one thing they all
 * agree on: `canonicalDatabasePath()` reads `.env` and ignores the shell, so a scratch server in the
 * same checkout finds the file the main world writes.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { anOfficeId } from './ids.ts'
import { sqlite } from '../db/client.ts'
import { nowStamp } from '@shared/time.ts'
import { canonicalApiAddress, canonicalDatabasePath, databaseDirectoryFrom } from '../../config/settings.mjs'
import { whoIsAt, theSentenceSayingWhyTheWorldEnded, theSentenceSayingTheAddressRefusedTwice, saysAReadTimedOut } from '../../config/world-address.mjs'
import { UNKNOWN } from '../../config/world-header.mjs'
import { databaseFileStatus } from '../db/client.ts'
import {
  MIRROR_FILE,
  isTheNameAServerGaveItself,
  isWorldKind,
  type Mirror,
  type Visit,
  type World,
  type WorldKind,
} from '@shared/worlds.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { PanelError } from './panel-error.ts'
import { worldKindWord } from '@shared/words.ts'
import { theWorldThisDatabaseIs } from './world.ts'
// The visits the mirror carries. The import goes this way because lib/visits.ts asks this file where
// the office is and this file asks it only for the rows.
import { openVisitsHere } from '../db/open-visits-here.ts'
import { aTestRunnerIsBehindThisProcess } from './runtime.ts'
// A WORLD'S REPORTS CARRY A KEY OF ITS STARTER. Criterion P83 point 5, decision
// jjfwwrrJy-qV (answer B). The key is made and revoked by the functions a run's key is, so there is
// one way a key is minted and one way one is taken back.
import { makeARunKey, revokeTheKeyNamed } from './keys.ts'
import { theHandleOfTheAgentAKeyProves } from './the-handle-of-the-agent-a-key-proves.ts'
import { howThisAgentsOwnKeyProvesAKey } from './provedkeys.ts'
import { KEY_HEADER } from '../../config/key-header.mjs'
import { inEnglish, saying, type DevSaying } from '@shared/dev-sayings.ts'

/**
 * IS THE OFFICE IN THIS DATABASE?
 *
 * True when this database holds a world of kind `home`, alive or dead. The file header says why the
 * rule is read from the rows rather than from the declaration's database path.
 *
 * ALIVE OR DEAD, AND THAT MATTERS. The main world's own server stopping is the moment the office
 * most needs to write its mirror — a world that has died is exactly what a reader of the mirror has
 * to be told about — and a rule that asked for a LIVE home world would stop mirroring at that
 * moment and leave the last copy saying the world was still up.
 *
 * READ EVERY TIME, NOT HELD. The test runner opens a new database per test in one process, and a
 * held answer would be about whichever database happened to be open first.
 */
export function theOfficeIsInThisDatabase(): boolean {
  const row = sqlite
    .prepare("SELECT id FROM worlds WHERE kind = 'home' LIMIT 1")
    .get() as { id: string } | undefined
  return row !== undefined
}

/**
 * IS THIS DATABASE A COPY OF THE MAIN WORLD'S, being served as a second world? The home row's
 * database identity, when it is not this database's own — or null, when it is not.
 *
 * WHY IT HAS TO BE SAID. A world is a database, and a database's identity is its path and its
 * birthtime, so a copy is a different world. But the copy carries the ORIGINAL's rows, home row
 * included, so it opens believing it is the office and answers `isTheOffice: true` about a list of
 * worlds none of which is itself. The owner met this on 4 September: a copy of their live database
 * could not serve as a second world, and nothing on the page said why. They had to use an empty
 * database instead.
 *
 * A COPY MADE BY tools/isolated-mole-office.mjs NO LONGER CARRIES IT: that copy deletes the office's
 * home rows (THE_ROWS_A_WORLDS_COPY_REMOVES in src/config/what-a-copy-must-not-carry.mjs), so this
 * answers null there. It still answers for a copy made any other way, and for a world copied before.
 *
 * THE READING IS THE TWO IDENTITIES SIDE BY SIDE, and nothing else: the home row says which
 * database it is about, and `theWorldThisDatabaseIs` says which one is answering. Equal is the
 * main world running normally; different is a copy.
 */
export function theHomeRowOfAnotherDatabase(): string | null {
  const row = sqlite
    .prepare("SELECT database_identity AS id FROM worlds WHERE kind = 'home' ORDER BY born_at DESC, rowid DESC LIMIT 1")
    .get() as { id: string } | undefined
  if (row === undefined) return null
  const here = theWorldThisDatabaseIs()
  if (here === null || row.id === here) return null
  return row.id
}

/** Where the main world's API answers, for a world that has to go and register at it. */
export function whereTheOfficeIs(): string {
  return canonicalApiAddress()
}

/**
 * WHERE THIS DATABASE'S OWN MIRROR GOES: beside the database, which for the canonical stack is
 * `data/worlds.json` — the file criterion C2 names.
 *
 * BESIDE THE DATABASE AND NOT BESIDE THE DECLARATION'S CANONICAL PATH, so that an office in a
 * throwaway database writes a throwaway mirror rather than over the one the real office wrote.
 */
export function mirrorBesideThisDatabase(): string {
  return join(databaseDirectoryFrom(databaseFileStatus().path), MIRROR_FILE)
}

/**
 * WHY THIS WORLD MUST LEAVE THE DECLARED OFFICE ALONE, or null because it may deal with it.
 *
 * ONE RULE FOR BOTH DIRECTIONS, WHICH IS WHY IT IS A FUNCTION. A world either belongs to the office
 * the declaration names or it does not, and the answer has to be the same whether the world is
 * writing to that office or reading from it. It was written on the writing side alone until 4
 * September 2026, and the reading side then went and read the owner's real list: a server started
 * by the suite in the live checkout answered `GET /api/office/worlds` with the ten worlds of the
 * person using this machine, because `data/worlds.json` was sitting beside the canonical database
 * and nothing said not to open it. Problem `JTdajUUs23_M` and the two tests named in its fix.
 *
 * A TEST RUNNER IS THE WHOLE OF THE RULE TODAY, and that is a fact about this process rather than
 * about a declaration it inherited. The declaration is read from `.env` and cannot be told apart
 * from the owner's own by anything a test can set, which is exactly why the reading has to come
 * from the process instead.
 */
export function whyTheDeclaredOfficeIsNotThisWorlds(): string | null {
  const said = whyTheDeclaredOfficeIsNotThisWorldsSaid()
  return said === null ? null : inEnglish(said)
}

/** The same reason as a code, which the Worlds page draws in its own language. */
function whyTheDeclaredOfficeIsNotThisWorldsSaid(): DevSaying | null {
  return aTestRunnerIsBehindThisProcess() ? saying('worldsTestRunnerReadsNoMirror', {}) : null
}

/**
 * THE MIRROR THIS WORLD MAY READ, and always the reason, whether there is a file or not.
 *
 * NULL IS NOT AN EMPTY OFFICE and it is not a missing file either: it is this world having no
 * business with that office at all. The reason travels with it so that no caller has to work out
 * which of the three it was, and so that the reply can say it.
 */
export function theMirrorThisWorldMayRead(): { file: string | null; why: string; whySaid: DevSaying } {
  const notMine = whyTheDeclaredOfficeIsNotThisWorldsSaid()
  if (notMine !== null) return { file: null, why: inEnglish(notMine), whySaid: notMine }
  const file = mirrorBesideTheCanonicalDatabase()
  const whySaid = saying('worldsTheMainWorldWrites', { file })
  return { file, why: inEnglish(whySaid), whySaid }
}

/**
 * WHERE THE MAIN WORLD'S MIRROR IS, for a world that has to read it because the main world does not
 * answer: beside the database the declaration calls canonical.
 *
 * THE SAME FILE AS `mirrorBesideThisDatabase()` WHENEVER THIS IS THE MAIN WORLD, and a different one
 * otherwise, which is the whole point. The two are separate functions because they answer separate
 * questions — where do I put mine, and where do I look for the office's — and a single function
 * would have to answer one of them wrongly.
 */
export function mirrorBesideTheCanonicalDatabase(): string {
  return join(databaseDirectoryFrom(canonicalDatabasePath()), MIRROR_FILE)
}

// ============================================================================ reading the rows

function asWorld(row: Record<string, unknown>): World {
  const said = (key: string): string | null => {
    const value = row[key]
    return value === null || value === undefined ? null : String(value)
  }
  const kind = String(row['kind'])
  return {
    id: String(row['id']),
    name: String(row['name']),
    purpose: said('purpose'),
    handback: said('handback'),
    // A STORED WORD NOBODY DECLARED IS KEPT AND NOT REPLACED. The check is the door's; a row written
    // before a word was retired still says what it says, and the reading function on the page names
    // it out loud rather than drawing it as one of the four.
    kind: kind as WorldKind,
    startedBy:
      row['started_by_kind'] === null || row['started_by_id'] === null
        ? null
        : { kind: String(row['started_by_kind']) as ParticipantRef['kind'], id: String(row['started_by_id']) },
    checkout: said('checkout'),
    head: said('head'),
    databaseIdentity: String(row['database_identity']),
    address: said('address'),
    addressForOtherMachines: said('address_for_other_machines'),
    standing: String(row['standing']),
    parentWorld: said('parent_world'),
    bornAt: String(row['born_at']),
    diedAt: said('died_at'),
    diedBecause: said('died_because'),
    installation: String(row['installation']),
  }
}

/** Every world the office knows, newest birth first. Dead ones included: the history is the point. */
export function worldsHere(): World[] {
  const rows = sqlite
    .prepare('SELECT * FROM worlds ORDER BY born_at DESC, id DESC')
    .all() as Record<string, unknown>[]
  return rows.map(asWorld)
}

/** The world with this office id, or null because no row has it. */
export function worldById(id: string): World | null {
  const row = sqlite.prepare('SELECT * FROM worlds WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row === undefined ? null : asWorld(row)
}

/** The live row for a database identity, or null because no world of that database is alive here. */
export function liveWorldOf(databaseIdentity: string): World | null {
  const row = sqlite
    .prepare('SELECT * FROM worlds WHERE database_identity = ? AND died_at IS NULL')
    .get(databaseIdentity) as Record<string, unknown> | undefined
  return row === undefined ? null : asWorld(row)
}

// ============================================================================ writing the rows

/** What a world says about itself when it comes to register. */
export interface WorldRegistration {
  name: string
  /**
   * WHAT THE WORLD IS FOR, in the starter's own words, or null because nobody said.
   *
   * A registration that carries none never empties a purpose the row already holds: see the
   * COALESCE in `registerWorldHere`. A world that says nothing is not an error, and a row written
   * before this column existed is not rewritten with an invented one.
   *
   * OPTIONAL BECAUSE THE ROUTE AND THE TOOL BOTH SAY IT EXPLICITLY and older callers do not know
   * the field; absent is normalised to null, which is the same answer as an empty sentence.
   */
  purpose?: string | null
  /**
   * WHICH HANDBACK THIS WORLD BELONGS TO, by record id, or null because nobody said.
   *
   * Read and normalised exactly the way `purpose` above is, and kept the same way: a registration
   * carrying none never empties one the row already holds. Criterion C33.
   */
  handback?: string | null
  kind: WorldKind
  startedBy: ParticipantRef | null
  checkout: string | null
  head: string | null
  databaseIdentity: string
  address: string | null
  /** Where another machine can reach it, or null because it serves only this computer. */
  addressForOtherMachines: string | null
  standing: string
  parentWorld: string | null
  installation: string
}

/**
 * WRITE A WORLD'S BIRTH DOWN, or hand back the row that is already there.
 *
 * IDEMPOTENT PER LIVE DATABASE IDENTITY, which is what makes a server restart safe and a second
 * server on one database honest: both are the same world answering, and a second row would be a
 * second world claiming one identity. What a returning registration DOES update is the address, the
 * commit and the standing, because those are about the process answering now and the row is what
 * somebody reaches the world by.
 *
 * THE NAME IS NEVER UPDATED, and that is criterion C5 rather than an oversight: a person may rename
 * a world, and a server restart that wrote its own name back over theirs would undo that edit the
 * next time anybody saved a file. The name in a returning registration is dropped on the floor.
 *
 * IT REFUSES A WORLD WITH NO IDENTITY. A row keyed by nothing could never be found again, and
 * `unknown` is what the world header says when a database file cannot be read at all.
 *
 * IT MAKES NO KEY. `registerAWorldAndItsReportsKey` below is the door's reading, which makes one
 * when an agent's key registered the world; every other caller registers a world here.
 */
export function registerWorldHere(said: WorldRegistration): World {
  return registerAWorld(said, null).world
}

/** The key a world's reports carry, answered once to the agent that registered the world. */
export interface AWorldsReportsKey {
  /** The key itself. It is in this reply and nowhere else: the office keeps only its SHA-256. */
  key: string
  /** The handle of the agent the key proves. A report sends the key under this name and no other. */
  holder: string
  /** The `held_keys` row that keeps its hash. Not a secret; it is what a revoke names. */
  heldKeyId: string
}

/** A registration's answer: the row, the key made for its reports or null, and one sentence why. */
export interface AWorldRegistered {
  world: World
  reportsKey: AWorldsReportsKey | null
  says: string
}

/**
 * REGISTER A WORLD, AND MAKE A KEY FOR ITS REPORTS WHEN AN AGENT'S KEY REGISTERED IT. Criterion P83
 * point 5, decision jjfwwrrJy-qV (answer B).
 *
 * ---------------------------------------------------------------------------------------
 * WHY A WORLD NEEDS A KEY AT THE OFFICE
 * ---------------------------------------------------------------------------------------
 *
 * A test world's server reports to the office it was copied from: that it started, what it is
 * called, which visits it holds, and that it ended. The world holds its own keys, which the office
 * does not know, so those reports proved nobody. So the agent that starts the world registers it
 * with its own key, and the office makes one more live key of that agent, as it does for a run. The
 * tool hands it to the world's server, and the world sends it under that agent's name.
 *
 * `keyHolder` is the agent id the caller's own agent key proved, or null. NULL MAKES NO KEY: a
 * world's own server, a keyless starter and the person register exactly as before.
 *
 * ONLY WHEN THIS CALL WROTE THE ROW. Registering is idempotent, and the world's own server registers
 * the same database again when it starts, under the key this made. A second key there would be a
 * key nobody holds and nothing revokes. So a registration that finds the live row makes no key.
 *
 * THE ROW AND THE KEY ARE ONE WRITE. Both are written in one transaction, so there is never a key
 * with no row to revoke it by, or a row that names a key that was not made.
 */
export function registerAWorldAndItsReportsKey(said: WorldRegistration, keyHolder: string | null): AWorldRegistered {
  return registerAWorld(said, keyHolder)
}

function registerAWorld(said: WorldRegistration, keyHolder: string | null): AWorldRegistered {
  if (said.databaseIdentity.trim() === '') {
    throw new PanelError(
      'A world registers by the identity of its database, and this registration named none. A world whose ' +
        'database cannot be identified cannot be registered, because nothing could find the row again.',
      400,
    )
  }
  if (!isWorldKind(said.kind)) {
    throw new PanelError(
      // THE WORD IS NAMED THROUGH THE READING TABLE, which says "unknown kind of world: x" for one
      // nobody declared. Writing the stored word straight into the sentence would be the one thing
      // src/shared/words.ts exists to stop, even in a refusal.
      `${worldKindWord(said.kind).text}. A world is a home, one an agent started, one a test started, or one on ` +
        'another machine.',
      400,
    )
  }
  const at = nowStamp()
  const already = liveWorldOf(said.databaseIdentity)
  if (already !== null) {
    sqlite
      .prepare(
        'UPDATE worlds SET address = ?, address_for_other_machines = ?, head = ?, standing = ?, ' +
          'purpose = COALESCE(purpose, ?), handback = COALESCE(handback, ?) WHERE id = ?',
      )
      .run(
        said.address,
        said.addressForOtherMachines,
        said.head,
        said.standing,
        said.purpose ?? null,
        said.handback ?? null,
        already.id,
      )
    writeTheMirror()
    return {
      world: worldById(already.id) ?? already,
      reportsKey: null,
      says:
        keyHolder === null
          ? A_WORLD_REGISTERED_WITHOUT_AN_AGENTS_KEY_GETS_NO_KEY
          : 'No key was made for this world’s reports, because this world was already registered. A world’s ' +
            'key is made only when its row is first written.',
    }
  }
  const id = anOfficeId()
  const made = sqlite.transaction((): AWorldsReportsKey | null => {
    sqlite
      .prepare(
        'INSERT INTO worlds (id, name, purpose, handback, kind, started_by_kind, started_by_id, checkout, head, ' +
          'database_identity, address, address_for_other_machines, standing, parent_world, born_at, ' +
          'died_at, died_because, installation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)',
      )
      .run(
        id,
        theNameThisWorldAlreadyHas(said.databaseIdentity) ?? said.name,
        said.purpose ?? null,
        said.handback ?? null,
        said.kind,
        said.startedBy?.kind ?? null,
        said.startedBy?.id ?? null,
        said.checkout,
        said.head,
        said.databaseIdentity,
        said.address,
        said.addressForOtherMachines,
        said.standing,
        said.parentWorld,
        at,
        said.installation,
      )
    if (keyHolder === null) return null
    const minted = makeARunKey(keyHolder, howThisAgentsOwnKeyProvesAKey(keyHolder))
    sqlite.prepare('UPDATE worlds SET run_key_id = ? WHERE id = ?').run(minted.heldKeyId, id)
    return { key: minted.key, holder: theHandleOfTheAgentAKeyProves(keyHolder), heldKeyId: minted.heldKeyId }
  })()
  writeTheMirror()
  const written = worldById(id)
  if (written === null) throw new PanelError('The world was registered and could not be read back.', 500)
  return {
    world: written,
    reportsKey: made,
    says:
      made === null
        ? A_WORLD_REGISTERED_WITHOUT_AN_AGENTS_KEY_GETS_NO_KEY
        : `A key of ${made.holder} was made for this world’s reports. It is in this reply and nowhere else. ` +
          'The office takes it back when it marks the world ended.',
  }
}

/** Why a world registered by a caller that proved no agent's key has no key for its reports. */
const A_WORLD_REGISTERED_WITHOUT_AN_AGENTS_KEY_GETS_NO_KEY =
  'No key was made for this world’s reports, because it was not registered with an agent’s own key.'

/**
 * THE `held_keys` ROW OF THE KEY A WORLD'S REPORTS CARRY, or null because none was made for it.
 *
 * Read by a test and by `closeWorldHere`. It is an id and not the key: the key is never stored.
 */
export function theReportsKeyRowOf(worldId: string): string | null {
  const row = sqlite.prepare('SELECT run_key_id AS id FROM worlds WHERE id = ?').get(worldId) as
    | { id: string | null }
    | undefined
  return row?.id ?? null
}

/**
 * THE NAME THIS WORLD ALREADY HAS, from the last row it had, or null because it has never had one.
 *
 * A NAME BELONGS TO A WORLD, NOT TO A ROW, and the rule is that a user names freely: a person names their
 * world and it stays named. `registerWorldHere` never renames a LIVE row, which was the whole of
 * that rule until C3 gave a world a death: the row is now closed on the way down, so the next start
 * found no live row, inserted a fresh one, and wrote the default name over the person's.
 *
 * Measured twice by the citizens verifier. `JBcKyo5VWOF0` was renamed `jamies world`, the server was
 * stopped and started, and at 17:44:19 that row closed and `9E6lZ4BtIysA` was born called
 * `my world`. Under `npm run dev`: `f77hILd0hxIt` renamed `jamies own world`, the stack stopped by
 * its group and started again, and `WNaVOUWOeoee` was born called `my world`. Problem
 * `RRC8NNCUl0jo`.
 *
 * THE ROWS ARE STILL ONE PER APPEARANCE, which is the other half of the rule: a world's appearing and
 * going away are both recorded. Reopening the old row would have fixed the name and thrown away the
 * history; carrying the name forward keeps both.
 *
 * THE LAST ROW AND NOT THE FIRST, so a world that has been renamed twice keeps the second name.
 *
 * ORDERED BY `rowid` AND NOT BY THE ID. Two appearances of one world a second apart share a
 * `born_at`, and a nanoid sorts arbitrarily — the first version of this took the earlier name half
 * the time. `rowid` is the order the rows were written, which is what "the last one" means here.
 */
function theNameThisWorldAlreadyHas(databaseIdentity: string): string | null {
  const row = sqlite
    .prepare('SELECT name FROM worlds WHERE database_identity = ? ORDER BY born_at DESC, rowid DESC LIMIT 1')
    .get(databaseIdentity) as { name: string } | undefined
  return row === undefined ? null : row.name
}

/**
 * CLOSE A WORLD'S ROW WITH A REASON. Criterion C3.
 *
 * IT IS NEVER DELETED and it never loses its reason. A row already closed is handed back unchanged:
 * three different things close a world — the supervisor stopping its server, the next server start
 * finding the process gone, and the stray sweep — and the first of them to arrive is the one whose
 * reason is true.
 *
 * AND THE KEY ITS REPORTS CARRIED IS REVOKED, IN THE SAME WRITE. Criterion P83 point 5: the key was
 * made when the world was made, and it ends when the world does. This is the one place a world's
 * row is marked ended, so the door's close, the office's Stop, the sweep of worlds nothing serves,
 * a world's own death report and the ledger's last process all revoke it here. A world with no key
 * revokes nothing.
 */
export function closeWorldHere(id: string, because: string): World {
  const world = worldById(id)
  if (world === null) throw new PanelError(`No world at this office has the id ${id}.`, 404)
  if (world.diedAt !== null) return world
  const reason = because.trim()
  if (reason === '') {
    throw new PanelError(
      'A world closes with a reason, in one plain sentence. A row saying a world ended and not why is a row ' +
        'somebody has to go and investigate.',
      400,
    )
  }
  sqlite.transaction(() => {
    sqlite.prepare('UPDATE worlds SET died_at = ?, died_because = ? WHERE id = ?').run(nowStamp(), reason, id)
    const key = theReportsKeyRowOf(id)
    if (key !== null) revokeTheKeyNamed(key, `the world "${world.name}" ended: ${reason}`)
  })()
  writeTheMirror()
  return worldById(id) ?? world
}

/** Give a world the name a person reads. Criterion C5: the hash stays the identity. */
export function renameWorldHere(id: string, name: string): World {
  const world = worldById(id)
  if (world === null) throw new PanelError(`No world at this office has the id ${id}.`, 404)
  sqlite.prepare('UPDATE worlds SET name = ? WHERE id = ?').run(name, id)
  writeTheMirror()
  return worldById(id) ?? world
}

/**
 * HOW MANY TICKS IN A ROW A WORLD'S ADDRESS HAS REFUSED THE CONNECTION.
 *
 * One refusal is not proof a world is dead: the world may be restarting, or the machine may be
 * busy. Only a second refusal in a row is treated as proof, and the count is kept in memory because
 * it is about this process's last looks and nothing else. A restart begins the count again. The key
 * is the world's office id.
 */
const refusalsInARow = new Map<string, number>()

/** A world the tick looked at, could not read, and therefore left exactly as it was. */
export interface WorldLeftAlone {
  id: string
  /** One line saying why nothing could be read, so a caller does not have to guess. */
  why: string
}

/** What one tick of the world sweep did: what it closed, and what it could not read. */
export interface TheWorldsNothingIsServing {
  /** The ids of the worlds the tick closed. */
  closed: string[]
  /** The ids of the worlds the tick left alone, each with the reason it could not read them. */
  leftAlone: WorldLeftAlone[]
}

/**
 * CLOSE EVERY OPEN WORLD WHOSE ADDRESS ANSWERS NOTHING. Criterion P87's third part.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ADDRESS AND NOT THE LEDGER
 * ---------------------------------------------------------------------------------------
 *
 * `aWorldEndsWhenNothingIsServingIt` in lib/resources.ts closes a world when the last process row
 * serving it is released, and that catches the ordinary way down. It cannot catch a world whose
 * process never reached this office's ledger at all — the tool writes process rows only when
 * `--show-to-the-person` is given, and a process killed with SIGKILL says nothing on the way out.
 * Measured on the owner's office on 12 September 2026: `ReRdV7xrih9G`, born the previous afternoon,
 * read `diedAt: null` while `ss -ltn` showed nothing listening on its port.
 *
 * THE ADDRESS IS THE READING THAT CANNOT BE FOOLED BY A MISSING ROW. It answers through the same
 * reader in src/config/world-address.mjs that `tools/close-worlds-nobody-serves.mjs` has used since
 * criterion C3, so both get the same three answers and the same failure words. They do NOT reach
 * the same verdict: the tool's dry run and the office's own row CAN give two different reasons. Two
 * rules below are this tick's alone — the skip of the office's own world, and the two-tick rule for
 * a refused connection. The tool is still one-shot, still asks the office's own address, and so can
 * still close the home row by hand with `--close` on a busy office. That is a known gap named here
 * and left to its own piece.
 *
 * A WORLD WITH NO ADDRESS IS LEFT ALONE. There is nothing to ask, and a row closed because nobody
 * could think of a way to check it is the fabricated evidence this repository forbids.
 *
 * IT NEVER CLOSES A WORLD THAT ANSWERS AS ITSELF, and a world that is answering as a different
 * database has ended — the port was taken by something that is not it.
 *
 * ---------------------------------------------------------------------------------------
 * THIS TICK RUNS INSIDE THE OFFICE'S OWN WORLD, SO IT NEVER ASKS IT
 * ---------------------------------------------------------------------------------------
 *
 * The office is one process. Asking its own address is a fetch a busy event loop can miss, and the
 * office then closed its own home row while it served every request. Measured on 22 September 2026
 * at 08:48:00 and 16:25:10: the row for the database 417b2af5dd06c9ee was closed with the timeout
 * sentence, and every list that reads "the office's home world" read a dead home. The world this
 * database is is answering by definition, because the tick is running inside it, so it is never
 * fetched and never closed here.
 *
 * ---------------------------------------------------------------------------------------
 * A FAILURE TO READ IS NOT PROOF OF DEATH
 * ---------------------------------------------------------------------------------------
 *
 * A world is closed only on a definite answer. Something answering as another database is definite
 * and closes the row at once. A refused connection — nothing listening — is definite only after two
 * ticks in a row. A timeout, an abort, a reset or a reply that is not a world proves nothing, so
 * the row is left alone and the reason is handed back in `leftAlone`.
 *
 * `fetchImpl` IS A PARAMETER SO A TEST CAN DRIVE IT without a socket. The production call passes
 * nothing and uses the real network.
 */
export async function closeTheWorldsNothingIsServing(
  options: { fetchImpl?: typeof fetch } = {},
): Promise<TheWorldsNothingIsServing> {
  const closed: string[] = []
  const leftAlone: WorldLeftAlone[] = []
  const here = theWorldThisDatabaseIs()
  for (const world of worldsHere()) {
    if (world.diedAt !== null) continue
    if (world.address === null || world.address === '') continue
    // THIS TICK RUNS INSIDE THIS WORLD. Asking it would measure how busy this process is, and a
    // late answer from a busy process is not a dead world. The row is never fetched and never
    // closed here.
    if (here !== null && world.databaseIdentity === here) continue
    const who = await whoIsAt(world.address, {
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    })
    if (who.answering && who.database === world.databaseIdentity) {
      // It answered as itself, so it is alive and any earlier refusal is forgotten.
      refusalsInARow.delete(world.id)
      continue
    }
    if (who.answering && who.database !== UNKNOWN) {
      // Something is there and says it is a different database, so this world's port was taken.
      closeWorldHere(world.id, theSentenceSayingWhyTheWorldEnded(world, who))
      closed.push(world.id)
      refusalsInARow.delete(world.id)
      continue
    }
    if (!who.answering && who.failure === 'refused') {
      const count = (refusalsInARow.get(world.id) ?? 0) + 1
      refusalsInARow.set(world.id, count)
      if (count >= 2) {
        closeWorldHere(world.id, theSentenceSayingTheAddressRefusedTwice(world))
        closed.push(world.id)
        refusalsInARow.delete(world.id)
        continue
      }
      leftAlone.push({
        id: world.id,
        why: `${who.why}. This is the first refusal, so the row is left alone until a second tick refuses it again.`,
      })
      continue
    }
    // A timeout, an abort, a reset or a reply that is not a world. A failure to read is not proof
    // that a world is dead, so the row is left exactly as it is and the reason travels back.
    refusalsInARow.delete(world.id)
    leftAlone.push({ id: world.id, why: who.why })
  }
  return { closed, leftAlone }
}

/**
 * KEEP THE OFFICE'S OWN HOME ROW ALIVE, without a restart.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The world sweep above used to ask the office's own address, time out while the process was busy,
 * and close the office's own home row. The row then said nothing served this database while the
 * office was answering every request. Requirement 1 of this fix stops that happening again, and
 * this function repairs the home rows that were already closed that way, because a restart is not
 * always wanted and the row a person reads should not stay dead in the meantime.
 *
 * IT PREFERS THE ROW THE SWEEP CLOSED BY TIMEOUT, AND REOPENS THAT ROW IN PLACE. A timeout sentence
 * is the one this fix knows was written wrongly by the sweep, so a row carrying it is opened again
 * exactly as it was. The name is never rewritten: the row keeps the name it had, which is criterion
 * C5. Nothing is ever deleted.
 *
 * WHEN NO DEAD HOME ROW CARRIES THE TIMEOUT SENTENCE, it registers a fresh home row through
 * `registerWorldHere`, using the most recent dead home row of this database as the template for the
 * address, purpose, standing and the rest. That is a new appearance rather than a reopened one, and
 * `registerWorldHere` carries the person's last chosen name onto it.
 *
 * IT DOES NOTHING WHEN THIS DATABASE IS NOT THE OFFICE, or when it has no identity to look a home
 * row up by. Both are real answers and are said in the reply.
 */
export function makeSureThisOfficesHomeRowIsAlive(): { repaired: boolean; why: string } {
  if (!theOfficeIsInThisDatabase()) {
    return { repaired: false, why: 'this database does not hold the office, so it has no home row here to keep' }
  }
  const here = theWorldThisDatabaseIs()
  if (here === null) {
    return { repaired: false, why: 'this database has no identity, so no home row can be looked up or written' }
  }
  const live = liveWorldOf(here)
  if (live !== null) {
    return { repaired: false, why: `the home row ${live.id} is already alive` }
  }
  const deadHomeRows = worldsHere().filter(
    (one) => one.kind === 'home' && one.databaseIdentity === here && one.diedAt !== null,
  )
  const timedOut = deadHomeRows.find((one) => saysAReadTimedOut(one.diedBecause))
  if (timedOut !== undefined) {
    // THE NAME IS NOT TOUCHED. The row is opened again with the name it had, because a name is a
    // person's to choose and reopening is not renaming.
    sqlite.prepare('UPDATE worlds SET died_at = NULL, died_because = NULL WHERE id = ?').run(timedOut.id)
    writeTheMirror()
    return {
      repaired: true,
      why:
        `reopened the dead home row ${timedOut.id}, which died at ${timedOut.diedAt} with the sentence ` +
        `"${timedOut.diedBecause}". The row keeps the name it had.`,
    }
  }
  const template = deadHomeRows[0]
  if (template === undefined) {
    return {
      repaired: false,
      why: 'this table holds no dead home row of this database to reopen, so there is nothing to copy for a fresh one',
    }
  }
  const fresh = registerWorldHere({
    name: template.name,
    purpose: template.purpose,
    handback: template.handback,
    kind: 'home',
    startedBy: template.startedBy,
    checkout: template.checkout,
    head: template.head,
    databaseIdentity: here,
    address: template.address,
    addressForOtherMachines: template.addressForOtherMachines,
    standing: template.standing,
    parentWorld: null,
    installation: template.installation,
  })
  return { repaired: true, why: `no dead home row had timed out, so a fresh home row ${fresh.id} was registered` }
}

// ============================================================================ the mirror

/**
 * WRITE THE MIRROR, after every change. Criterion C2.
 *
 * ONLY AN OFFICE WRITES ONE, because only an office has a list worth mirroring. A world that is not
 * an office writing this file would put its own short list where the office's belongs, and a world
 * reading the mirror because the main world is down would then read that and believe it.
 *
 * WRITTEN THROUGH A TEMPORARY FILE AND RENAMED, so a reader never sees half of it. `renameSync`
 * within one directory is atomic on every filesystem this runs on.
 *
 * A FAILURE HERE COSTS NOBODY THEIR REGISTRATION. The office is the table; the mirror is a copy of
 * it for a world that cannot reach the table. If the file cannot be written the rows are still
 * right, so the reason is thrown up to the caller only when the caller asked for the mirror itself.
 * The one thing that must never happen is a mirror that is silently stale, and `writtenAt` is what
 * makes that visible instead of hidden.
 */
export function writeTheMirror(): void {
  if (!theOfficeIsInThisDatabase()) return
  const mirror: Mirror = {
    writtenAt: nowStamp(),
    writtenBy: databaseIdentityOfThisOffice(),
    worlds: worldsHere(),
    visits: openVisitsHere(),
  }
  const path = mirrorBesideThisDatabase()
  mkdirSync(dirname(path), { recursive: true })
  const beside = `${path}.writing`
  writeFileSync(beside, `${JSON.stringify(mirror, null, 2)}\n`, 'utf8')
  renameSync(beside, path)
}

/**
 * The mirror as it stands on disk, or null because there is none or it cannot be read.
 *
 * NULL IS A REAL ANSWER AND NOT AN EMPTY OFFICE. A caller that read null must say "nobody could tell
 * me", never "there are no worlds": the second is a claim about the installation and this function
 * cannot make one.
 */
export function readTheMirror(path: string | null): Mirror | null {
  if (path === null || !existsSync(path)) return null
  try {
    const said = JSON.parse(readFileSync(path, 'utf8')) as Partial<Mirror>
    if (typeof said.writtenAt !== 'string' || !Array.isArray(said.worlds) || !Array.isArray(said.visits)) return null
    return {
      writtenAt: said.writtenAt,
      writtenBy: typeof said.writtenBy === 'string' ? said.writtenBy : '',
      worlds: said.worlds as World[],
      visits: said.visits as Visit[],
    }
  } catch {
    // Catching to the letter of invariant 4: what is handled here is "this file is not a mirror this
    // version can read", and what is done about it is to answer null, which every reader already
    // treats as "nobody could tell me" rather than as an empty office.
    return null
  }
}

/**
 * WHERE A WORLD'S NAME WAS READ, for a reader that has only its database identity.
 *
 * `this database` is a row of this database's own `worlds` table. `the office` is a row of the
 * office's list, read from the mirror the office writes, and only a world that is not the office
 * reads one.
 */
export interface AWorldNamed {
  world: World
  from: 'this database' | 'the office'
}

/**
 * WHICH LIST OF WORLDS A NAME COULD BE LOOKED FOR IN, BESIDE THIS DATABASE'S OWN.
 *
 * `this is the office`: this database holds the office, so its own table is the whole list.
 * `read`: this world read the office's mirror, written at `writtenAt`.
 * `not read`: this world read no list of the office's, and `why` says why, in a sentence that ends
 * with a full stop.
 */
export type TheOfficesList =
  | { state: 'this is the office' }
  | { state: 'read'; writtenAt: string }
  | { state: 'not read'; why: string }

/**
 * THE WORLDS THIS WORLD CAN NAME, looked up by database identity.
 *
 * WHY A WORLD NEEDS THE OFFICE'S LIST. A citizen copied from the office has the office's database
 * identity as home. A world's copy no longer carries the office's home row
 * (THE_ROWS_A_WORLDS_COPY_REMOVES in src/config/what-a-copy-must-not-carry.mjs), so the world's own
 * table cannot name that world. The office's mirror can.
 *
 * THIS DATABASE'S OWN ROW WINS. `nameOf` looks in this database's table first and in the office's
 * list after it. The office reads its own table only.
 *
 * `look` is the mirror this world may read. It is a parameter so a test can hand it a mirror it
 * wrote; every caller in the app passes nothing.
 */
export function theWorldsThisWorldCanName(
  look: { file: string | null; why: string } = theMirrorThisWorldMayRead(),
): { nameOf: (databaseIdentity: string) => AWorldNamed | null; officesList: TheOfficesList } {
  const own = worldsHere()
  let theirs: World[] = []
  let officesList: TheOfficesList
  if (theOfficeIsInThisDatabase()) {
    officesList = { state: 'this is the office' }
  } else {
    const mirror = readTheMirror(look.file)
    if (mirror !== null) {
      theirs = mirror.worlds
      officesList = { state: 'read', writtenAt: mirror.writtenAt }
    } else if (look.file === null) {
      officesList = { state: 'not read', why: look.why.endsWith('.') ? look.why : `${look.why}.` }
    } else {
      officesList = { state: 'not read', why: `no list the office wrote could be read at ${look.file}.` }
    }
  }
  const nameOf = (databaseIdentity: string): AWorldNamed | null => {
    const mine = own.find((one) => one.databaseIdentity === databaseIdentity)
    if (mine !== undefined) return { world: mine, from: 'this database' }
    const at = theirs.find((one) => one.databaseIdentity === databaseIdentity)
    return at === undefined ? null : { world: at, from: 'the office' }
  }
  return { nameOf, officesList }
}

/**
 * The identity of the database this office is in, for the mirror to say who wrote it.
 *
 * Read through the world header's own reading, so a mirror and the replies of the server that wrote
 * it cannot disagree about which world that is. There is no import cycle: lib/world.ts knows nothing
 * about this file.
 */
function databaseIdentityOfThisOffice(): string {
  return theWorldThisDatabaseIs() ?? ''
}

/**
 * WHO THIS WORLD'S SERVER SAYS IT IS WHEN IT REPORTS TO THE OFFICE, AND THE KEY THAT PROVES IT.
 * Criterion P83 point 5, decision jjfwwrrJy-qV (answer B).
 *
 * ONE PLACE FOR THE FIVE REPORTS. `reportThisWorldToTheOffice`, `reportThisWorldsDeathToTheOffice`
 * and `tellTheOfficeThisWorldIsCalled` below, and `reportHeldVisitsToTheOffice` and
 * `reportThisVisitEndedToTheOffice` in lib/visits.ts, all build their identity headers here, so the
 * key and the name it goes under are worked out once.
 *
 * WITH A KEY. `tools/isolated-mole-office.mjs` registers the world at the office with its starter's
 * own key, and the office answers one more key of that starter, made for this world. The tool puts
 * the key in `MOLE_WORLD_REPORT_KEY` and the handle of the agent it proves in `MOLE_WORLD_REPORT_AS`,
 * in the environment of this world's server only: never a command line, never a log, never `.env`.
 * They are not `MOLE_OFFICE_` settings on purpose, because every setting can be read back on the
 * runtime page and a key must not be. The key goes under its holder's name, because the office
 * refuses an agent's key sent under another name.
 *
 * WITHOUT ONE, the reports go as they always did: under the office's own name, with no key. That is
 * every world a keyless starter made, every world started by hand, and every test world.
 *
 * A KEY WITH NO NAME IS REFUSED, loudly. It could only be sent under a name that is not its holder's,
 * and the office would refuse it anyway; this says why before anything is sent.
 */
export function theHeadersThisWorldReportsUnder(): Record<string, string> {
  const key = process.env['MOLE_WORLD_REPORT_KEY']
  const as = process.env['MOLE_WORLD_REPORT_AS']
  if (key === undefined || key === '') {
    return { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-api-server' }
  }
  if (as === undefined || as.trim() === '') {
    throw new Error(
      'MOLE_WORLD_REPORT_KEY is set and MOLE_WORLD_REPORT_AS is not, so nothing says which agent the key proves. ' +
        'The office refuses a key sent under another name. Nothing was sent.',
    )
  }
  return { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': as.trim(), [KEY_HEADER]: key }
}

/**
 * TELL THE MAIN WORLD THAT THIS WORLD HAS STARTED. Criterion C3.
 *
 * *A server registers its world at the office when it starts — through the main world's API; if it
 * is the main world, in its own table.* This is the first half. The row is written in this world's
 * own table first, because a world always knows about itself; this then carries the same facts to
 * the office so that the list a person reads holds every world and not only the main one.
 *
 * ---------------------------------------------------------------------------------------
 * IT DOES NOTHING UNDER A TEST RUNNER, AND THAT IS THE POINT RATHER THAN AN OMISSION
 * ---------------------------------------------------------------------------------------
 *
 * The office's address comes from the declaration, which reads `.env` and ignores the shell — so
 * every server a test starts would report itself to whatever is answering on the declared port,
 * which on this machine is the owner's own Mole Office. A suite run would write hundreds of rows
 * into the owner's corpus. A test world registers in the test's own database, where the test can read it and
 * where it disappears with the temporary directory, and criterion C9 asks for exactly that.
 *
 * IT NEVER FAILS A START. The main world being down is ordinary, and the reply says so in words. The
 * next start tries again; nothing here retries.
 */
export async function reportThisWorldToTheOffice(
  world: World,
): Promise<{ told: boolean; why: string; atTheOffice?: string | null }> {
  if (theOfficeIsInThisDatabase()) {
    return { told: false, why: 'this world holds the office, so its own table is where the row already is' }
  }
  const notMine = whyTheDeclaredOfficeIsNotThisWorlds()
  if (notMine !== null) return { told: false, why: notMine }
  const where = `${whereTheOfficeIs()}/api/office/worlds`
  try {
    const res = await fetch(where, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...theHeadersThisWorldReportsUnder() },
      body: JSON.stringify(world),
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return { told: false, why: `the office at ${where} answered ${String(res.status)}` }
    // THE ID THE OFFICE GAVE THE ROW, kept so the same world can be closed there when this process
    // stops. The office keeps its own table, so its id for this world is not this world's own — and
    // a death reported against the wrong id would close somebody else's world.
    const said = (await res.json()) as { world?: { id?: unknown } }
    const atTheOffice = typeof said.world?.id === 'string' ? said.world.id : null
    return { told: true, why: `the office at ${where} wrote it down`, atTheOffice }
  } catch (err) {
    return {
      told: false,
      why: `nothing answered at ${where} (${err instanceof Error ? err.message : String(err)})`,
    }
  }
}

/**
 * TELL THE OFFICE THIS WORLD HAS ENDED, the other half of `reportThisWorldToTheOffice`.
 *
 * A WORLD THAT REPORTED ITS BIRTH AND NEVER ITS DEATH IS A ROW THAT LIVES FOR EVER. Nine of them
 * were sitting in the owner's office on 4 September 2026 — problem `JTdajUUs23_M` — every one of
 * them a scratch server that had started, said so, and gone. `closeWorldHere` closes the row in the
 * world's OWN table, which is the only table that world can reach; the office's copy is a second
 * row in a second database and nothing was closing it.
 *
 * IT IS NOT THE WHOLE ANSWER AND IT IS NOT MEANT TO BE. A process killed with SIGKILL runs no
 * shutdown, so a row can still be left open, and that is what
 * `tools/close-worlds-nobody-serves.mjs` is for: it asks each address whether anything is there.
 * This is the ordinary way down, where the world can say for itself why it ended.
 */
export async function reportThisWorldsDeathToTheOffice(
  atTheOffice: string,
  because: string,
): Promise<{ told: boolean; why: string }> {
  const notMine = whyTheDeclaredOfficeIsNotThisWorlds()
  if (notMine !== null) return { told: false, why: notMine }
  const where = `${whereTheOfficeIs()}/api/office/worlds/${atTheOffice}/close`
  try {
    const res = await fetch(where, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...theHeadersThisWorldReportsUnder() },
      body: JSON.stringify({ because }),
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return { told: false, why: `the office at ${where} answered ${String(res.status)}` }
    return { told: true, why: `the office at ${where} marked it ended` }
  } catch (err) {
    return { told: false, why: `nothing answered at ${where} (${err instanceof Error ? err.message : String(err)})` }
  }
}

/**
 * WHETHER THE OFFICE SHOULD BE TOLD A NEW NAME, and which row to tell it about, or why not.
 *
 * A PURE FUNCTION SO EVERY ANSWER CAN BE HELD STILL. The reporting around it is refused before it
 * opens a socket whenever a test runner started the process — that is the guard problem
 * `JTdajUUs23_M` needed — so this is the half of it a test can drive, and every branch here is one
 * a person could meet.
 */
export function whetherTheOfficeShouldBeToldTheName(
  held: World | undefined,
  databaseIdentity: string,
  name: string,
  handle: string,
): { tell: string | null; why: string } {
  if (held === undefined) {
    return { tell: null, why: `the office holds no open row for the world ${databaseIdentity}` }
  }
  if (held.name === name) return { tell: null, why: 'the office already calls this world that' }
  if (!isTheNameAServerGaveItself(held.name, handle)) {
    return { tell: null, why: `the office calls this world "${held.name}", which nothing here may write over` }
  }
  return { tell: held.id, why: `the office's row ${held.id} is still the name a server gave itself` }
}

/**
 * TELL THE OFFICE WHAT THIS WORLD IS CALLED, when this world is not the office.
 *
 * WHY IT IS NEEDED AT ALL. A world names itself on the way up, before anything can say what it is
 * for, and the purpose arrives later — through `POST /api/runtime/register` with a `detail`. That
 * renamed the world's own row and stopped there, and nothing reads that row: a world which is not
 * the office answers from the mirror, so the purpose was written where no list a person reads would
 * ever show it. Every agent-made world on every list was still `<handle>'s world`. Problem
 * `0wPbeU5pdYW5`, reopened by the citizens verifier after the first fix did only half of it.
 *
 * IT ASKS THE OFFICE WHAT IT HOLDS FIRST. The office's copy is a different row in a different
 * database and may have been renamed there by a person; writing over that would be this server
 * taking a name off somebody. The handle is passed and the rule is asked HERE, through the same
 * `isTheNameAServerGaveItself` the world applies to its own row, so there is one rule, no call site
 * that could pass a different one, and no seam a test cannot reach.
 *
 * IT NEVER FAILS ANYTHING. A name that did not reach the office is a list that reads a little worse,
 * and the sentence says so.
 */
export async function tellTheOfficeThisWorldIsCalled(
  databaseIdentity: string,
  name: string,
  handle: string,
): Promise<{ told: boolean; why: string }> {
  if (theOfficeIsInThisDatabase()) {
    return { told: false, why: 'this world holds the office, so the row that was renamed is the office\u2019s own' }
  }
  const notMine = whyTheDeclaredOfficeIsNotThisWorlds()
  if (notMine !== null) return { told: false, why: notMine }
  const office = whereTheOfficeIs()
  try {
    const headers = { 'content-type': 'application/json', ...theHeadersThisWorldReportsUnder() }
    const listed = await fetch(`${office}/api/office/worlds`, { headers, signal: AbortSignal.timeout(2000) })
    if (!listed.ok) return { told: false, why: `the office at ${office} answered ${String(listed.status)}` }
    const said = (await listed.json()) as { worlds?: World[] }
    const mine = (said.worlds ?? []).find((one) => one.databaseIdentity === databaseIdentity && one.diedAt === null)
    const decided = whetherTheOfficeShouldBeToldTheName(mine, databaseIdentity, name, handle)
    if (decided.tell === null) return { told: false, why: decided.why }
    const res = await fetch(`${office}/api/office/worlds/${encodeURIComponent(decided.tell)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return { told: false, why: `the office at ${office} answered ${String(res.status)} to the new name` }
    return { told: true, why: `the office at ${office} now calls this world "${name}"` }
  } catch (err) {
    return { told: false, why: `nothing answered at ${office} (${err instanceof Error ? err.message : String(err)})` }
  }
}
