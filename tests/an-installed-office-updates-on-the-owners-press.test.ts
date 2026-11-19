// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INSTALLED OFFICE UPDATES ITS OWN DATABASE, BUT ONLY ON ITS OWNER'S PRESS (wave 13n, round 58).
 *
 * On 10 October 2026 the start check refused the owner's installed office and named a command,
 * `npm run db:backup && … npm run db:migrate`, that an installed office has no checkout to run. Now an
 * installed office waits in a reduced mode (src/server/lib/the-update.ts) and offers one press, "Back up
 * and update". A checkout still refuses and names the command, word for word.
 *
 * The database every test here uses is a test office with one note written straight into the file, past
 * every door, so the revision step really would write to it: the same case startup.test.ts uses for
 * "still refuses a database a migration really would write to".
 *
 * Since wave 13s round 257 the press also gives each agent whose id is still a handle a new id, after the
 * migrations, when the office has filed no re-mint yet. The last block of cases holds that.
 *
 * PICTURES. With TEST_SHOTS naming a folder, the last case photographs the page after a press whose re-mint
 * refused, at 1440, 990, 660 and 390 in both looks, into the-update-remint-refused under it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import type { BrowserContext } from 'playwright'

import { freshDb, theBrowserThisWorkerShares, theOfficesOwnIdIn, type TestDb } from './helpers.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { testShots } from './where-shots-go.ts'
import type { TheUpdateOffer, TheUpdateReading } from '../src/shared/the-update.ts'

// The first test imports the server's modules cold, which was measured at 2.7 to 5 s.
vi.setConfig({ testTimeout: 30_000 })

const shots = process.env.TEST_SHOTS === undefined || process.env.TEST_SHOTS === '' ? null : testShots('the-update-remint-refused')

let t: TestDb | undefined
afterEach(() => {
  t?.close()
  t = undefined
})

const PAST_THE_DOOR = 'written-past-the-door'

/**
 * A test office that a migration would write to, and the offer its start check makes. `first` changes the office
 * before the note is written and the start check runs.
 */
async function anOfficeWaitingForThePress(first?: (sqlite: Database.Database) => Promise<void>): Promise<{ db: TestDb; sqlite: Database.Database; offer: TheUpdateOffer }> {
  const db = await freshDb()
  t = db
  const sqlite = db.client.sqlite
  await first?.(sqlite)
  sqlite
    .prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, origin, kind, title, summary, data) ' +
        `VALUES (?, 'default', ?, '2026-10-10 09:00:00', '2026-10-10 09:00:00', 'authored', 'note', ?, NULL, ?)`,
    )
    .run(PAST_THE_DOOR, THE_TEST_OFFICES_OWNER.id, 'a note nothing filed', '{"body":"made-up test data"}')
  const { prepareToServe } = await import('../src/server/db/migrate.ts')
  const decision = prepareToServe(sqlite, MIGRATIONS)
  // THE CONTROL: the start check refuses this file and carries what the update needs.
  if (decision.serve || decision.update === undefined) throw new Error(`the start check did not offer an update: ${decision.serve ? decision.report : decision.refusal}`)
  const backups = join(dirname(db.file), 'backups')
  mkdirSync(backups, { recursive: true })
  return { db, sqlite, offer: { file: db.file, holds: decision.update.holds, wouldWrite: decision.update.wouldWrite, backups } }
}

/** How many revisions the note written past the door has. The update writes its first one. */
function revisionsOfTheNote(sqlite: Database.Database): number {
  return (sqlite.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(PAST_THE_DOOR) as { n: number }).n
}

/** Every table and its row count, read from the file. */
function everyCount(sqlite: Database.Database): Record<string, number> {
  const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((row) => row.name)
  return Object.fromEntries(tables.map((table) => [table, (sqlite.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n]))
}

/** The person's key, from the key file the office makes beside its database on first use. */
async function thePersonsKey(file: string): Promise<string> {
  const { ensureKeysExist } = await import('../src/server/lib/keys.ts')
  ensureKeysExist()
  return (JSON.parse(readFileSync(join(dirname(file), 'keys.json'), 'utf8')) as { person: string }).person
}

/** The copies kept for a restore, beside the database. None may be left after the press ends. */
function safetyCopiesBeside(file: string): string[] {
  return readdirSync(dirname(file)).filter((name) => name.startsWith(`.${basename(file)}.before-the-update-`))
}

/** The address the browser cases open. Nothing listens there: the reduced mode answers each request. */
const AT = 'http://the-waiting-office.test'

/** Answer every request the browser makes to AT by the reduced mode itself, through `inject`, with the browser's own headers. */
async function answeredByTheReducedMode(context: BrowserContext, app: FastifyInstance): Promise<void> {
  await context.route(`${AT}/**`, async (route) => {
    const request = route.request()
    const answer = await app.inject({ method: request.method() as 'GET' | 'POST', url: new URL(request.url()).pathname, headers: await request.allHeaders() })
    const headers = Object.fromEntries(Object.entries(answer.headers).map(([name, value]) => [name, String(value)]))
    await route.fulfill({ status: answer.statusCode, headers, body: answer.rawPayload })
  })
}

describe('a checkout keeps its refusal and its command', () => {
  it('refuses with the command word for word, and does not offer the update', async () => {
    const { db, sqlite } = await anOfficeWaitingForThePress()
    const { prepareToServe } = await import('../src/server/db/migrate.ts')
    const { theUpdateIsOffered } = await import('../src/server/lib/the-update.ts')
    const decision = prepareToServe(sqlite, MIGRATIONS)
    expect(decision.serve).toBe(false)
    if (decision.serve) return
    expect(decision.refusal.endsWith(`\n\n    npm run db:backup && MOLE_OFFICE_DB=${db.file} npm run db:migrate`)).toBe(true)
    expect(theUpdateIsOffered(decision, 'checkout')).toBe(false)
    expect(theUpdateIsOffered(decision, 'bundle')).toBe(true)
  })
})

describe('the reduced mode of an installed office', () => {
  it('says it waits, refuses the press without the owner\'s key, and writes nothing', async () => {
    const { sqlite, offer } = await anOfficeWaitingForThePress()
    const { theReducedMode } = await import('../src/server/lib/the-update.ts')
    const { app } = theReducedMode({ sqlite, offer, migrationsFolder: MIGRATIONS, headers: () => ({}) })
    const before = everyCount(sqlite)
    try {
      const health = await app.inject({ method: 'GET', url: '/api/health' })
      expect(health.statusCode).toBe(503)
      expect(health.json()).toMatchObject({ ok: false, updateWaiting: true })

      const reading = (await app.inject({ method: 'GET', url: '/api/office/the-update' })).json() as TheUpdateReading
      expect(reading.update.state).toBe('offered')
      expect(reading.mayPress).toBe(false)
      expect(reading.offer.wouldWrite.length).toBeGreaterThan(0)

      const refused = await app.inject({ method: 'POST', url: '/api/office/the-update' })
      expect(refused.statusCode).toBe(403)
      expect(refused.json()).toMatchObject({ code: 'updateOnlyTheOwner' })

      const other = await app.inject({ method: 'GET', url: '/api/records' })
      expect(other.statusCode).toBe(503)
      expect(other.json()).toMatchObject({ code: 'updateWaiting' })

      const page = await app.inject({ method: 'GET', url: '/' })
      expect(page.headers['content-type']).toContain('text/html')
      expect(page.body).toContain('Back up and update')

      expect(everyCount(sqlite), 'nothing is written without the press').toEqual(before)
      expect(readdirSync(offer.backups)).toEqual([])
    } finally {
      await app.close()
    }
  })

  it('backs up, updates, checks and then serves on the owner\'s press', async () => {
    const { db, sqlite, offer } = await anOfficeWaitingForThePress()
    const { theReducedMode } = await import('../src/server/lib/the-update.ts')
    const { prepareToServe } = await import('../src/server/db/migrate.ts')
    const { app, done } = theReducedMode({ sqlite, offer, migrationsFolder: MIGRATIONS, headers: () => ({}) })
    try {
      expect(revisionsOfTheNote(sqlite)).toBe(0)
      const key = { 'x-mole-office-key': await thePersonsKey(db.file) }
      expect(((await app.inject({ method: 'GET', url: '/api/office/the-update', headers: key })).json() as TheUpdateReading).mayPress).toBe(true)

      const pressed = await app.inject({ method: 'POST', url: '/api/office/the-update', headers: key })
      expect(pressed.statusCode).toBe(200)
      const reading = pressed.json() as TheUpdateReading
      expect(reading.update.state, JSON.stringify(reading.update)).toBe('done')
      if (reading.update.state !== 'done') return
      expect(dirname(reading.update.backup)).toBe(offer.backups)
      expect(existsSync(reading.update.backup)).toBe(true)
      await done

      expect(revisionsOfTheNote(sqlite), 'the update wrote what the start check said it would').toBe(1)
      expect(prepareToServe(sqlite, MIGRATIONS).serve).toBe(true)
      expect(safetyCopiesBeside(db.file)).toEqual([])

      const again = await app.inject({ method: 'POST', url: '/api/office/the-update', headers: key })
      expect(again.statusCode).toBe(409)
      expect(again.json()).toMatchObject({ code: 'updateAlreadyPressed' })
    } finally {
      await app.close()
    }
  })

  // A WINDOW THAT WAS NEVER PAIRED holds no key, and the reduced mode serves no pairing door. Its keyless press, over
  // a real socket from this computer's own program, is the one the pairing press would already hand the owner's key
  // to, so it is the owner's here too. The same request naming an agent is refused, and nothing is written.
  // CONTROL: passes. MUTATIONS, each red: the own-program answer made `&& false` (the window's press is refused); the
  // line that refuses a request naming an agent made a no-op (the agent's press is taken). RESTORE: passes.
  it('takes a keyless press from this computer\'s own program, as the installed window sends it, and refuses one naming an agent', async () => {
    const { sqlite, offer } = await anOfficeWaitingForThePress()
    const { theReducedMode } = await import('../src/server/lib/the-update.ts')
    const { app, done } = theReducedMode({ sqlite, offer, migrationsFolder: MIGRATIONS, headers: () => ({}) })
    await app.listen({ port: 0, host: '127.0.0.1' })
    try {
      const address = app.server.address()
      if (address === null || typeof address === 'string') throw new Error('the reduced mode is listening on no port')
      const at = `http://127.0.0.1:${String(address.port)}/api/office/the-update`
      const before = everyCount(sqlite)

      const asAnAgent = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-willow' }
      expect(((await (await fetch(at, { headers: asAnAgent })).json()) as TheUpdateReading).mayPress).toBe(false)
      const refused = await fetch(at, { method: 'POST', headers: asAnAgent })
      expect(refused.status).toBe(403)
      expect(await refused.json()).toMatchObject({ code: 'updateOnlyTheOwner' })
      expect(everyCount(sqlite), 'the refused press wrote nothing').toEqual(before)

      expect(((await (await fetch(at)).json()) as TheUpdateReading).mayPress).toBe(true)
      const pressed = await fetch(at, { method: 'POST' })
      expect(pressed.status).toBe(200)
      expect(((await pressed.json()) as TheUpdateReading).update.state).toBe('done')
      await done
      expect(revisionsOfTheNote(sqlite)).toBe(1)
    } finally {
      await app.close()
    }
  })
})

describe('a failed update loses nothing and says so', () => {
  it('leaves the file as it was when the migrations stop, and keeps the backup', async () => {
    const { db, sqlite, offer } = await anOfficeWaitingForThePress()
    const { backUpAndUpdate, THE_UPDATE_SEAM } = await import('../src/server/lib/the-update.ts')
    const before = everyCount(sqlite)
    const original = THE_UPDATE_SEAM.migrate
    // A MIGRATION THAT WRITES AND THEN REFUSES, inside its own transaction, as `migrateInPlace` does.
    THE_UPDATE_SEAM.migrate = (target) =>
      target.transaction(() => {
        target.prepare("UPDATE records SET title = 'changed by a made-up migration' WHERE id = ?").run(PAST_THE_DOOR)
        throw new Error('A made-up migration refused, for this test.')
      })()
    let ended
    try {
      ended = await backUpAndUpdate(sqlite, offer, MIGRATIONS)
    } finally {
      THE_UPDATE_SEAM.migrate = original
    }
    expect(ended.state).toBe('failed')
    if (ended.state !== 'failed') return
    expect(ended.file).toBe('unchanged')
    expect(ended.said).toContain('A made-up migration refused, for this test.')
    expect(ended.said.join(' ')).not.toContain('npm run')
    expect(ended.backup).not.toBeNull()
    expect(existsSync(ended.backup ?? '')).toBe(true)
    expect(everyCount(sqlite)).toEqual(before)
    expect((sqlite.prepare('SELECT title FROM records WHERE id = ?').get(PAST_THE_DOOR) as { title: string }).title).toBe('a note nothing filed')
    expect(safetyCopiesBeside(db.file)).toEqual([])
  })

  it('puts the file back as it was when a check after the migrations fails', async () => {
    const { db, sqlite, offer } = await anOfficeWaitingForThePress()
    const { backUpAndUpdate, THE_UPDATE_SEAM } = await import('../src/server/lib/the-update.ts')
    const before = everyCount(sqlite)
    expect(String(sqlite.pragma('journal_mode', { simple: true }))).toBe('wal')
    const original = THE_UPDATE_SEAM.afterTheMigrations
    THE_UPDATE_SEAM.afterTheMigrations = (target) => {
      // The migrations committed: the revision is written. The check then fails.
      expect(revisionsOfTheNote(target)).toBe(1)
      throw new Error('A made-up check failed, for this test.')
    }
    let ended
    try {
      ended = await backUpAndUpdate(sqlite, offer, MIGRATIONS)
    } finally {
      THE_UPDATE_SEAM.afterTheMigrations = original
    }
    expect(ended.state).toBe('failed')
    if (ended.state !== 'failed') return
    expect(ended.file).toBe('restored')
    expect(ended.said.join(' ')).toContain('A made-up check failed, for this test.')
    expect(existsSync(ended.backup ?? '')).toBe(true)
    expect(revisionsOfTheNote(sqlite), 'the restore took the update\'s write back out').toBe(0)
    expect(everyCount(sqlite)).toEqual(before)
    expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(safetyCopiesBeside(db.file)).toEqual([])
  })

  it('does not start when the backup cannot be made, and says so without a command', async () => {
    const { sqlite, offer } = await anOfficeWaitingForThePress()
    const { backUpAndUpdate } = await import('../src/server/lib/the-update.ts')
    const before = everyCount(sqlite)
    // The folder named for the backups is a file, so no backup can be written into it.
    const ended = await backUpAndUpdate(sqlite, { ...offer, backups: join(offer.file) }, MIGRATIONS)
    expect(ended.state).toBe('failed')
    if (ended.state !== 'failed') return
    expect(ended.backup).toBeNull()
    expect(ended.file).toBe('unchanged')
    expect(ended.said.join(' ')).not.toMatch(/npm run|--to|--check-only/u)
    expect(everyCount(sqlite)).toEqual(before)
  })
})

describe('the window reads the waiting office as its own', () => {
  /** An answer the window's address check reads, with the body the reduced mode sends, or another. */
  async function theWindowReads(body: Record<string, unknown>): Promise<unknown> {
    const { WORLD_HEADER, formatWorldHeader } = await import('../src/config/world-header.mjs')
    const { whoIsAt } = await import('../src/config/world-address.mjs')
    const header = formatWorldHeader({ database: 'aaaaaaaaaaaaaaaa', repository: '/somewhere', port: '46107', head: '546d00f', standing: 'scratch' })
    const fetchImpl = (async () => new Response(JSON.stringify(body), { status: 503, headers: { [WORLD_HEADER]: header } })) as unknown as typeof fetch
    const answered = await whoIsAt('http://127.0.0.1:46107', { fetchImpl, withHealth: true, asks: 1 })
    return answered.answering ? answered.health : undefined
  }

  it('reads updateWaiting from the health answer, and not from an answer that lacks it', async () => {
    expect(await theWindowReads({ ok: false, wrong: ['waiting'], updateWaiting: true })).toMatchObject({ ok: false, updateWaiting: true })
    expect(await theWindowReads({ ok: false, wrong: ['broken'] })).not.toHaveProperty('updateWaiting')
  })
})

// THE OFFER SAYS WHERE THE PRESS IS (wave 13n, round DV). A browser that has not paired is shown the offer without the
// press, as `mayPressTheUpdate` says, and the page then says where the press is, so a person is never left at an offer
// with nothing to do. A paired browser is shown the press and not that sentence. The page is the reduced mode's own,
// drawn in a browser; each of its requests is answered by the reduced mode itself through `inject`, with the browser's
// own headers. So a browser that holds no key comes from no program of this computer, and one whose cookie holds the
// owner's key is a paired browser. The sentence is read from the words the page's own words come from.
// Since round DW that sentence is the only place on the page that says where the press is. The older sentence above it
// said "a browser on that computer" while this one says "a browser that has paired", and two places that say one thing
// drift apart.
// CONTROL: passes. MUTATIONS, each red: the sentence left out of the unpaired page (the unpaired case); the sentence
// drawn whatever the reading says (the paired case); the older sentence's place put back (the one-place case).
// RESTORE: passes.
describe('the offer says where the press is', () => {
  const WHERE = 'theUpdate.page.whereToPress'

  /** The sentence that says where the press is, from the page's words, or undefined when they hold none. */
  async function theSentence(): Promise<unknown> {
    const { enWave13n } = await import('../src/shared/words/en-wave-13n.ts')
    return (enWave13n as Record<string, unknown>)[WHERE]
  }

  /** What the offer page says once it is drawn, and how many presses it shows, to a browser paired or not. */
  async function theOfferPage(paired: boolean): Promise<{ says: string; presses: number }> {
    const { db, sqlite, offer } = await anOfficeWaitingForThePress()
    const { theReducedMode } = await import('../src/server/lib/the-update.ts')
    const { KEY_COOKIE } = await import('../src/config/key-header.mjs')
    const { app } = theReducedMode({ sqlite, offer, migrationsFolder: MIGRATIONS, headers: () => ({}) })
    const context = await (await theBrowserThisWorkerShares()).newContext()
    try {
      if (paired) await context.addCookies([{ name: KEY_COOKIE, value: await thePersonsKey(db.file), url: AT }])
      await answeredByTheReducedMode(context, app)
      const page = await context.newPage()
      await page.goto(`${AT}/`)
      // The offer is drawn: what the check found, and the panel that holds the press or says who may press.
      await page.locator('#the-update .panel').nth(1).waitFor()
      return { says: await page.locator('#the-update').innerText(), presses: await page.locator('#back-up-and-update').count() }
    } finally {
      await context.close()
      await app.close()
    }
  }

  it('shows a browser that has not paired the offer without the press, and says where the press is', async () => {
    const sentence = await theSentence()
    expect(typeof sentence, 'the page\'s words hold the sentence that says where the press is').toBe('string')
    const { says, presses } = await theOfferPage(false)
    expect(presses, 'a browser that has not paired is not given the press').toBe(0)
    expect(says).toContain(String(sentence))
  })

  it('shows a paired browser the press, and not the sentence', async () => {
    const sentence = await theSentence()
    expect(typeof sentence, 'the page\'s words hold the sentence that says where the press is').toBe('string')
    const { says, presses } = await theOfferPage(true)
    expect(presses, 'a paired browser is given the press').toBe(1)
    expect(says).not.toContain(String(sentence))
  })

  it('says where the press is in that one sentence only, so nothing else on the page names a window or a browser', async () => {
    const sentence = await theSentence()
    expect(typeof sentence, 'the page\'s words hold the sentence that says where the press is').toBe('string')
    const { says } = await theOfferPage(false)
    expect(says).toContain(String(sentence))
    const theRest = says.split(String(sentence)).join('\n')
    expect(theRest.match(/\b(window|browser)s?\b/giu) ?? [], 'another sentence on the page says where the press is').toEqual([])
  })
})

// THE PRESS GIVES EACH AGENT WHOSE ID IS STILL A HANDLE A NEW ID (wave 13s, round 257). Every office installed before 12
// November 2026 holds at least one such legacy row: its own. After the migrations, when the office holds a legacy agent
// and has filed no re-mint generation, the press stages the re-mint's map and applies it with the re-mint's own
// functions. A refusal of the re-mint does not fail the update: every agent keeps its id, the office opens, and the page
// says so with the re-mint's own sentence (decision yN53G4es-mgC). The map is kept in a folder beside the backup, named
// from the backup's own name, which no reader of the backups folder takes for a backup. Cases:
//   A. an office whose own row's id is its handle: the row takes an id that could not be a handle, one generation is
//      filed, the kept agent-id list holds the old id beside the new one, and the face is the same picture;
//   B. an office with no legacy agent, and an office re-minted once that holds a legacy agent made since: no id
//      changes, no generation is added, no map is made, and nothing is said;
//   C. a re-mint that refuses at its stage (a legacy resident) and at its apply (a row at a legacy drawn key that is not
//      a drawing): the update is done, every id is kept, no generation is filed, the refusal is said, and the map the
//      apply refused is kept; the page says every id was kept, and the re-mint's own sentence;
//   D. after a re-mint the counts and the start check pass, and a check made to fail after it still puts the copy back,
//      re-mint and all;
//   E. after a re-mint the Settings panel counts one backup file, each list of backups reads one backup, and the map is
//      in its folder.
// At the cut, before the press re-mints anything, A, C, D and E are red and B passes. MUTATIONS, each in
// src/server/lib/the-update.ts: the condition for the re-mint made false (A red); the generations left out of that
// condition (B red); the line that keeps the refusal's sentence deleted (C red); the map written as a file beside the
// backup and not into its folder (E red on the panel's count).
describe('the press gives each agent whose id is still a handle a new id', () => {
  const RESIDENT = 'made-up-heron'
  const MADE_SINCE = 'made-up-wren'

  /**
   * THE OFFICE'S OWN ROW AS AN OFFICE INSTALLED BEFORE 12 NOVEMBER 2026 HOLDS IT: its id is its handle, and its face is
   * the drawing at the key of that id, drawn from that id. A fresh test office mints the row's id, so both are put back.
   */
  async function theOwnRowAsAnOlderOfficeHoldsIt(sqlite: Database.Database): Promise<void> {
    const { MOLE_OFFICE_HANDLE, defaultAvatarAssetId } = await import('../src/shared/participants.ts')
    const own = sqlite.prepare('SELECT id, avatar_asset_id AS face FROM agents WHERE id = ?').get(theOfficesOwnIdIn(sqlite)) as { id: string; face: string }
    const face = defaultAvatarAssetId({ kind: 'agent', id: MOLE_OFFICE_HANDLE })
    sqlite.transaction(() => {
      // The face's key and the row that wears it change together, so the key to assets is checked at the commit.
      sqlite.pragma('defer_foreign_keys = ON')
      sqlite.prepare('UPDATE assets SET id = ?, drawn_from = NULL WHERE id = ?').run(face, own.face)
      sqlite.prepare('UPDATE agents SET id = ?, avatar_asset_id = ? WHERE id = ?').run(MOLE_OFFICE_HANDLE, face, own.id)
    })()
  }

  /** A legacy agent made past the door, its id its handle, wearing the office's own face. `residentSince` makes it a permanent resident. */
  function aLegacyAgent(sqlite: Database.Database, id: string, residentSince: string | null = null): void {
    const face = (sqlite.prepare('SELECT avatar_asset_id AS face FROM agents WHERE id = ?').get(theOfficesOwnIdIn(sqlite)) as { face: string }).face
    sqlite
      .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired, resident_since) VALUES (?, ?, ?, ?, ?, 0, ?)')
      .run(id, `Made-up ${id}`, id, face, '2026-10-01 09:00:00', residentSince)
  }

  /** The re-mint run once by its own functions, as `npm run db:migrate -- --stage-remint` and then `--remint` run it. */
  async function reMintedOnce(sqlite: Database.Database): Promise<void> {
    const { stageTheRemint } = await import('../src/server/db/remint-migration.ts')
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const { THE_MIGRATION_JOURNAL_TABLE, theMigrationsInTheFolder, theMigrationsNotYetApplied } = await import('../src/config/migration-look.mjs')
    const rows = sqlite.prepare(`SELECT hash, created_at FROM "${THE_MIGRATION_JOURNAL_TABLE}"`).all() as { hash: string; created_at: number }[]
    const pending = (theMigrationsNotYetApplied(rows, theMigrationsInTheFolder(MIGRATIONS)) as { tag: string }[]).map((one) => one.tag)
    migrateInPlace(sqlite, MIGRATIONS, stageTheRemint(sqlite, join(dirname(sqlite.name), 'staged-before-the-press.json'), pending))
  }

  /** How many re-mint generations the office has filed. */
  async function generationsIn(sqlite: Database.Database): Promise<number> {
    const { THE_GENERATIONS } = await import('../src/server/db/remint-migration.ts')
    return (sqlite.prepare(`SELECT count(*) AS n FROM ${THE_GENERATIONS}`).get() as { n: number }).n
  }

  /** What the address of an agent's face sends, as GET /api/assets/:id reads its row. */
  async function theFaceOf(sqlite: Database.Database, agent: string): Promise<unknown> {
    const { whatAnAssetRowSends } = await import('../src/server/lib/avatar-drawing.ts')
    const key = (sqlite.prepare('SELECT avatar_asset_id AS key FROM agents WHERE id = ?').get(agent) as { key: string }).key
    return whatAnAssetRowSends(sqlite.prepare('SELECT * FROM assets WHERE id = ?').get(key) as Record<string, unknown> | undefined, key, dirname(sqlite.name))
  }

  /** Every agent's id and handle. */
  const theAgents = (sqlite: Database.Database): unknown[] => sqlite.prepare('SELECT id, handle FROM agents ORDER BY id').all()

  /** The folders in the backups folder that are not a backup's files folder. */
  async function theOtherFolders(backups: string): Promise<string[]> {
    const { isAFilesFolderName } = await import('../src/shared/what-is-kept.ts')
    return readdirSync(backups, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !isAFilesFolderName(entry.name))
      .map((entry) => entry.name)
  }

  /** The press, by the function the reduced mode calls. */
  async function press(sqlite: Database.Database, offer: TheUpdateOffer) {
    const { backUpAndUpdate } = await import('../src/server/lib/the-update.ts')
    return backUpAndUpdate(sqlite, offer, MIGRATIONS)
  }

  it("A. gives the office's own row an id that could not be a handle, files one generation and the old id beside the new, and keeps its face", async () => {
    const { sqlite, offer } = await anOfficeWaitingForThePress(theOwnRowAsAnOlderOfficeHoldsIt)
    const { MOLE_OFFICE_HANDLE, couldBeAHandle, defaultAvatarAssetId } = await import('../src/shared/participants.ts')
    const { THE_KEPT_LISTS } = await import('../src/server/db/remint-migration.ts')
    // THE CONTROL: the row's id is its handle, and its face is a drawing.
    expect(theOfficesOwnIdIn(sqlite)).toBe(MOLE_OFFICE_HANDLE)
    const face = await theFaceOf(sqlite, MOLE_OFFICE_HANDLE)
    expect(face).toHaveProperty('drawing')

    const ended = await press(sqlite, offer)
    expect(ended.state, JSON.stringify(ended)).toBe('done')
    expect(ended).not.toHaveProperty('remintRefused')
    const id = theOfficesOwnIdIn(sqlite)
    expect(id).not.toBe(MOLE_OFFICE_HANDLE)
    expect(couldBeAHandle(id), `${id} could be a handle`).toBe(false)
    expect(await generationsIn(sqlite)).toBe(1)
    expect(sqlite.prepare(`SELECT old, new FROM ${THE_KEPT_LISTS} WHERE list = 'agent_id'`).all()).toEqual([{ old: MOLE_OFFICE_HANDLE, new: id }])
    expect((sqlite.prepare('SELECT avatar_asset_id AS key FROM agents WHERE id = ?').get(id) as { key: string }).key).toBe(defaultAvatarAssetId({ kind: 'agent', id }))
    expect(await theFaceOf(sqlite, id), 'the face under the key of the new id is the same picture').toEqual(face)
  })

  it('B. changes no id and makes no map in an office with no legacy agent', async () => {
    const { sqlite, offer } = await anOfficeWaitingForThePress()
    const { whereEachAgentsIdCameFrom } = await import('../src/server/lib/registry-aliases/remint-map.ts')
    // THE CONTROL: every agent's id came from the mint.
    expect(whereEachAgentsIdCameFrom(sqlite).filter((one) => one.from !== 'minted')).toEqual([])
    const before = theAgents(sqlite)

    const ended = await press(sqlite, offer)
    expect(ended.state, JSON.stringify(ended)).toBe('done')
    expect(ended).not.toHaveProperty('remintRefused')
    expect(theAgents(sqlite)).toEqual(before)
    expect(await generationsIn(sqlite)).toBe(0)
    expect(await theOtherFolders(offer.backups)).toEqual([])
  })

  it('B. re-mints an office once: a legacy agent made after its re-mint keeps its id, and nothing more is filed', async () => {
    const { sqlite, offer } = await anOfficeWaitingForThePress(async (s) => {
      await theOwnRowAsAnOlderOfficeHoldsIt(s)
      await reMintedOnce(s)
      aLegacyAgent(s, MADE_SINCE)
    })
    const { whereEachAgentsIdCameFrom } = await import('../src/server/lib/registry-aliases/remint-map.ts')
    // THE CONTROL: one generation is filed, and the agent made since is the one legacy agent.
    expect(await generationsIn(sqlite)).toBe(1)
    expect(whereEachAgentsIdCameFrom(sqlite).filter((one) => one.from === 'legacy').map((one) => one.id)).toEqual([MADE_SINCE])
    const before = theAgents(sqlite)

    const ended = await press(sqlite, offer)
    expect(ended.state, JSON.stringify(ended)).toBe('done')
    expect(ended).not.toHaveProperty('remintRefused')
    expect(theAgents(sqlite)).toEqual(before)
    expect(await generationsIn(sqlite)).toBe(1)
    expect(await theOtherFolders(offer.backups)).toEqual([])
  })

  it("C. keeps every id and the migrations when the map cannot be made, opens the office, and keeps the re-mint's own sentence", async () => {
    const { sqlite, offer } = await anOfficeWaitingForThePress(async (s) => {
      await theOwnRowAsAnOlderOfficeHoldsIt(s)
      aLegacyAgent(s, RESIDENT, '2026-10-02 09:00:00')
    })
    const { A_RESIDENT_STOPS_THE_REMINT } = await import('../src/server/lib/registry-aliases/remint-map.ts')
    const { prepareToServe } = await import('../src/server/db/migrate.ts')
    const before = theAgents(sqlite)

    const ended = await press(sqlite, offer)
    expect(ended).toMatchObject({ state: 'done', remintRefused: expect.stringContaining(A_RESIDENT_STOPS_THE_REMINT) })
    expect(theAgents(sqlite)).toEqual(before)
    expect(await generationsIn(sqlite)).toBe(0)
    expect(revisionsOfTheNote(sqlite), 'the migrations were kept').toBe(1)
    expect(prepareToServe(sqlite, MIGRATIONS).serve).toBe(true)
    expect(safetyCopiesBeside(sqlite.name)).toEqual([])
    // A stage that refused wrote no map, and its folder is not left behind.
    expect(await theOtherFolders(offer.backups)).toEqual([])
  })

  it('C. keeps every id when the apply refuses, and keeps the map it refused beside the backup', async () => {
    let face = ''
    const { sqlite, offer } = await anOfficeWaitingForThePress(async (s) => {
      await theOwnRowAsAnOlderOfficeHoldsIt(s)
      // A picture that is not a drawing, at the key of the own row's drawn face, so the apply refuses to rename it.
      face = (s.prepare('SELECT avatar_asset_id AS face FROM agents WHERE id = ?').get(theOfficesOwnIdIn(s)) as { face: string }).face
      s.prepare("UPDATE assets SET mime = 'image/png' WHERE id = ?").run(face)
    })
    const { MOLE_OFFICE_HANDLE } = await import('../src/shared/participants.ts')
    const { readTheStagedRemint } = await import('../src/server/db/remint-migration.ts')
    const { theMapsFolderFor } = await import('../src/server/lib/the-update.ts')
    const before = theAgents(sqlite)

    const ended = await press(sqlite, offer)
    expect(ended).toMatchObject({ state: 'done', remintRefused: expect.stringContaining(JSON.stringify(face)) })
    if (ended.state !== 'done') return
    expect(theAgents(sqlite)).toEqual(before)
    expect(await generationsIn(sqlite)).toBe(0)
    const folder = theMapsFolderFor(ended.backup)
    const kept = readdirSync(folder)
    expect(kept.length, 'the map the apply refused is kept').toBe(1)
    const staged = readTheStagedRemint(join(folder, kept[0]!))
    expect(staged.map.entries.filter((entry) => entry.from === 'legacy').map((entry) => entry.oldId)).toEqual([MOLE_OFFICE_HANDLE])
  })

  /**
   * THE PAGE AFTER A PRESS WHOSE RE-MINT REFUSED, pressed in a browser that has paired: what it says once the done panel
   * is drawn. Given a folder, the page is then photographed into it at four widths in both looks.
   */
  async function theDonePageAfterARefusal(into: string | null): Promise<string> {
    const { db, sqlite, offer } = await anOfficeWaitingForThePress(async (s) => {
      await theOwnRowAsAnOlderOfficeHoldsIt(s)
      aLegacyAgent(s, RESIDENT, '2026-10-02 09:00:00')
    })
    const { theReducedMode } = await import('../src/server/lib/the-update.ts')
    const { KEY_COOKIE } = await import('../src/config/key-header.mjs')
    const { app } = theReducedMode({ sqlite, offer, migrationsFolder: MIGRATIONS, headers: () => ({}) })
    const browser = await theBrowserThisWorkerShares()
    const contexts: BrowserContext[] = []
    try {
      const context = await browser.newContext()
      contexts.push(context)
      await context.addCookies([{ name: KEY_COOKIE, value: await thePersonsKey(db.file), url: AT }])
      await answeredByTheReducedMode(context, app)
      const page = await context.newPage()
      await page.goto(`${AT}/`)
      await page.locator('#back-up-and-update').click()
      await page.locator('#the-update .panel.done').waitFor()
      const says = await page.locator('#the-update').innerText()
      for (const theme of into === null ? [] : (['light', 'dark'] as const)) {
        const looked = await browser.newContext({ colorScheme: theme })
        contexts.push(looked)
        await answeredByTheReducedMode(looked, app)
        const at = await looked.newPage()
        for (const width of [1440, 990, 660, 390]) {
          await at.setViewportSize({ width, height: 900 })
          await at.goto(`${AT}/`)
          await at.locator('#the-update .panel.done').waitFor()
          await at.screenshot({ path: join(into as string, `the-update-remint-refused-${String(width)}-${theme}.png`), fullPage: true })
        }
      }
      return says
    } finally {
      for (const context of contexts) await context.close()
      await app.close()
    }
  }

  it("C. says on the page that the update is done, that every agent's id was kept, and the re-mint's own sentence", async () => {
    const { enWave13n } = await import('../src/shared/words/en-wave-13n.ts')
    const { A_RESIDENT_STOPS_THE_REMINT } = await import('../src/server/lib/registry-aliases/remint-map.ts')
    const words = enWave13n as Record<string, unknown>
    expect(typeof words['theUpdate.page.remintRefused'], "the page's words hold the sentence that says every id was kept").toBe('string')
    const says = await theDonePageAfterARefusal(null)
    expect(says).toContain(String(words['theUpdate.page.doneHeading']))
    expect(says).toContain(String(words['theUpdate.page.remintRefused']))
    expect(says).toContain(A_RESIDENT_STOPS_THE_REMINT)
  })

  it('D. passes the counts and the start check after a re-mint, and the office serves', async () => {
    const { sqlite, offer } = await anOfficeWaitingForThePress(theOwnRowAsAnOlderOfficeHoldsIt)
    const { prepareToServe } = await import('../src/server/db/migrate.ts')

    const ended = await press(sqlite, offer)
    expect(ended.state, JSON.stringify(ended)).toBe('done')
    expect(await generationsIn(sqlite), 'the re-mint ran').toBe(1)
    expect(prepareToServe(sqlite, MIGRATIONS).serve).toBe(true)
    expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(revisionsOfTheNote(sqlite)).toBe(1)
    expect(safetyCopiesBeside(sqlite.name)).toEqual([])
  })

  it('D. puts the file back as it was, re-mint and all, when a check after the re-mint fails', async () => {
    const { sqlite, offer } = await anOfficeWaitingForThePress(theOwnRowAsAnOlderOfficeHoldsIt)
    const { THE_UPDATE_SEAM } = await import('../src/server/lib/the-update.ts')
    const { THE_GENERATIONS } = await import('../src/server/db/remint-migration.ts')
    const { MOLE_OFFICE_HANDLE } = await import('../src/shared/participants.ts')
    const before = everyCount(sqlite)
    let filedWhenTheCheckRan: number | null = null
    const original = THE_UPDATE_SEAM.afterTheMigrations
    THE_UPDATE_SEAM.afterTheMigrations = (target) => {
      filedWhenTheCheckRan = (target.prepare(`SELECT count(*) AS n FROM ${THE_GENERATIONS}`).get() as { n: number }).n
      throw new Error('A made-up check failed after the re-mint, for this test.')
    }
    let ended
    try {
      ended = await press(sqlite, offer)
    } finally {
      THE_UPDATE_SEAM.afterTheMigrations = original
    }
    expect(filedWhenTheCheckRan, 'the re-mint had filed its generation when the checks ran').toBe(1)
    expect(ended).toMatchObject({ state: 'failed', file: 'restored' })
    expect(theOfficesOwnIdIn(sqlite)).toBe(MOLE_OFFICE_HANDLE)
    expect(await generationsIn(sqlite)).toBe(0)
    expect(everyCount(sqlite)).toEqual(before)
    expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(safetyCopiesBeside(sqlite.name)).toEqual([])
  })

  it('E. keeps the map in a folder beside the backup, which no reader of the backups folder takes for a backup', async () => {
    const { sqlite, offer } = await anOfficeWaitingForThePress(theOwnRowAsAnOlderOfficeHoldsIt)
    const { theMapsFolderFor } = await import('../src/server/lib/the-update.ts')
    const { readTheBackupsFolder } = await import('../src/server/lib/what-is-kept.ts')
    const { theBackupsInTheFolder } = await import('../src/server/lib/backup.ts')
    const { readCompleteBackups } = await import('../src/server/lib/complete-backups.ts')
    const { isAFilesFolderName } = await import('../src/shared/what-is-kept.ts')
    const { THE_GENERATIONS, readTheStagedRemint } = await import('../src/server/db/remint-migration.ts')

    const ended = await press(sqlite, offer)
    expect(ended.state, JSON.stringify(ended)).toBe('done')
    if (ended.state !== 'done') return
    // THE SETTINGS PANEL'S COUNT: one backup file, and the map's folder is neither a backup file nor a files folder.
    const panel = readTheBackupsFolder(offer.backups)
    expect(panel.count, panel.says).toBe(1)
    expect(panel.filesFolders).toBe(readdirSync(offer.backups).filter((name) => isAFilesFolderName(name)).length)
    // THE LISTS OF BACKUPS: the one the backups door answers, and the one the prune, the floor and the hand-over read.
    expect(theBackupsInTheFolder(offer.backups).backups.map((one) => one.name)).toEqual([basename(ended.backup)])
    const complete = readCompleteBackups(offer.backups)
    expect([...complete.backups, ...complete.unstamped].map((one) => one.entry.name)).toEqual([basename(ended.backup)])
    // THE MAP: in the folder named from the backup's name, and the one the re-mint applied.
    const folder = theMapsFolderFor(ended.backup)
    expect(dirname(folder)).toBe(offer.backups)
    expect(await theOtherFolders(offer.backups)).toEqual([basename(folder)])
    const kept = readdirSync(folder)
    expect(kept.length).toBe(1)
    const digest = (sqlite.prepare(`SELECT digest FROM ${THE_GENERATIONS}`).get() as { digest: string }).digest
    expect(readTheStagedRemint(join(folder, kept[0]!)).map.digest).toBe(digest)
  })

  it.runIf(shots !== null)('photographs the page after a refused re-mint at four widths in both looks', async () => {
    await theDonePageAfterARefusal(shots)
  }, 120_000)
})
