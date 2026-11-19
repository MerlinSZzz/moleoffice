// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESET FILES THE FIRST-START RECORDS UNDER THE SEED CLOCK AND IDS (wave 13y round 38).
 * Round 39 adds the secretary's schedule and the secretariat group.
 *
 * The real reset, with the review environment, must leave every shipped chapter and every role card's
 * words in the database, the seed secretary's schedule and the secretariat group with its members.
 * Their records, revisions, changes, stored short forms and group stamps carry midnight.
 * Calling the four first-start writers afterwards writes nothing, in any table. The product's
 * own start decision must also say it would serve this database.
 *
 * tests/two-resets-of-one-path-on-one-day-write-the-same-rows.test.ts compares every table, ids
 * included, so it also holds these rows to the same ids on two resets of one path on one day.
 */
import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { localStamp } from '../src/shared/time.ts'
import { SHIPPED_CHAPTER_NUMBERS } from '../src/shared/chapter-check.ts'
import { SECRETARIAT_GROUP_KEY } from '../src/shared/groups.ts'
import { theReviewEnvironment } from '../tools/review.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
type Row = { id: string; created_at: string; updated_at: string; data: string }

/** Every table is counted, including groups and group_members, and any indirect first-start write. */
function counts(db: Database.Database): Record<string, number> {
  const counted = Object.fromEntries((db.prepare("select name from sqlite_master where type = 'table' order by name").all() as { name: string }[])
    .map(({ name }) => [name, (db.prepare(`select count(*) as n from "${name}"`).get() as { n: number }).n]))
  expect(Object.keys(counted)).toEqual(expect.arrayContaining(['records', 'revisions', 'changes', 'groups', 'group_members']))
  return counted
}

/** The writers store short-form, copy and schedule stamps inside record and revision data. */
function stampsIn(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, part]) =>
    ['at', 'copiedAt', 'madeAt', 'endedAt'].includes(key) && typeof part === 'string' ? [part] : stampsIn(part))
}

describe('a reset writes the first-start records under the seed clock', () => {
  let folder: string
  let db: Database.Database
  let client: typeof import('../src/server/db/client.ts')
  let defaults: typeof import('../src/server/lib/default-regulations.ts')
  let words: typeof import('../src/server/lib/card-words.ts')
  let secretariat: typeof import('../src/server/lib/secretariat.ts')
  let broadcasts: typeof import('../src/server/lib/broadcast.ts')
  let secretary: Row
  let group: { id: string; opened_at: string } | undefined
  let members: { member_kind: string; member_id: string; joined_at: string; left_at: string | null }[]
  let secretaryIds: string[]
  let personId: string
  let chapters: Row[]
  let cards: Row[]
  let cardNames: string[]
  let midnight: string

  beforeAll(async () => {
    folder = aTestDatabaseFolder('reset-first-start')
    const file = join(folder, 'panelx.db')
    const day = localStamp(new Date()).slice(0, 10)
    const reviewEnvironment = theReviewEnvironment(process.env, 1, 2, file, () => {})
    const done = spawnSync(join(REPO, 'node_modules/.bin/tsx'), ['scripts/reset.ts'], {
      cwd: REPO,
      env: reviewEnvironment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (done.status !== 0) throw new Error(`Reset ended with ${String(done.status)}:\n${done.stdout}\n${done.stderr}`)
    expect(localStamp(new Date()).slice(0, 10), 'the reset crossed midnight; run it again').toBe(day)
    midnight = `${day} 00:00:00`
    db = new Database(file)
    chapters = db.prepare("select * from records where json_extract(data, '$.extra.chapter') is not null").all() as Row[]
    cards = db.prepare("select * from records where kind = 'role_card_words'").all() as Row[]
    vi.resetModules()
    vi.stubEnv('MOLE_OFFICE_DB', file)
    vi.stubEnv('MOLE_OFFICE_OWNER_ID', reviewEnvironment.MOLE_OFFICE_OWNER_ID)
    vi.stubEnv('MOLE_OFFICE_OWNER_NAME', reviewEnvironment.MOLE_OFFICE_OWNER_NAME)
    client = await import('../src/server/db/client.ts')
    personId = (await import('../src/server/lib/owner.ts')).theOfficeOwner().id
    const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
    const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
    const declaration = readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
    cardNames = [...declaration.cards, ...declaration.personCards].map((card) => card.name).sort()
    defaults = await import('../src/server/lib/default-regulations.ts')
    words = await import('../src/server/lib/card-words.ts')
    secretariat = await import('../src/server/lib/secretariat.ts')
    broadcasts = await import('../src/server/lib/broadcast.ts')
    secretary = db.prepare("select * from records where kind = 'agent' and json_extract(data, '$.handle') = 'seed-secretary'").get() as Row
    secretaryIds = secretariat.theSecretaries().map((who) => who.id)
    group = db.prepare('select id, opened_at from groups where about = ?').get(SECRETARIAT_GROUP_KEY) as typeof group
    members = group === undefined ? [] : db.prepare('select member_kind, member_id, joined_at, left_at from group_members where group_id = ?').all(group.id) as typeof members
  })

  afterAll(() => {
    client?.sqlite.close()
    db?.close()
    vi.unstubAllEnvs()
    if (folder !== undefined) removeThisTestFolder(folder)
  })

  function allFirstStartRows(): Row[] {
    expect(chapters, 'reset must copy every shipped default chapter').toHaveLength(SHIPPED_CHAPTER_NUMBERS.length)
    expect(cards.map((row) => JSON.parse(row.data).roleName).sort(), 'reset must file every card\'s words').toEqual(cardNames)
    return [...chapters, ...cards]
  }

  it('has every shipped chapter, every card words record, the secretary schedule and the secretariat with its members', () => {
    allFirstStartRows()
    expect(chapters.map((row) => JSON.parse(row.data).extra.chapter).sort((a, b) => a - b)).toEqual([...SHIPPED_CHAPTER_NUMBERS].sort((a, b) => a - b))
    expect(JSON.parse(secretary.data).extra?.broadcastSchedule, 'reset must file the seed secretary schedule').toEqual({ madeAt: midnight, endedAt: null })
    expect(group, 'reset must make the secretariat group').toBeDefined()
    expect(secretaryIds.length).toBeGreaterThan(0)
    expect(members.map((row) => `${row.member_kind}:${row.member_id}`).sort()).toEqual([
      `person:${personId}`, ...secretaryIds.map((id) => `agent:${id}`),
    ].sort())
  })

  it('stamps every first-start record, revision, change, short form, schedule, group and membership with the reset midnight', () => {
    for (const row of allFirstStartRows()) {
      expect(row.created_at, row.id).toBe(midnight)
      expect(row.updated_at, row.id).toBe(midnight)
      const data = JSON.parse(row.data)
      const revisions = db.prepare('select at, data from revisions where record_id = ? order by seq').all(row.id) as { at: string; data: string }[]
      const changes = db.prepare('select at from changes where record_id = ?').all(row.id) as { at: string }[]
      const chapter = chapters.some((one) => one.id === row.id)
      expect(revisions, row.id).toHaveLength(chapter ? 3 : 1)
      expect(changes.length, row.id).toBeGreaterThanOrEqual(chapter ? 3 : 1)
      if (chapter) {
        expect(data.extra.copiedFromTheDefaults.at).toBe(midnight)
        expect(data.shortForms.label.at).toBe(midnight)
      } else expect(data.copiedAt).toBe(midnight)
      const stamps = [
        ...stampsIn(data),
        ...revisions.flatMap((revision) => [revision.at, ...stampsIn(JSON.parse(revision.data))]),
        ...changes.map((change) => change.at),
      ]
      expect(stamps.filter((stamp) => stamp !== midnight), row.id).toEqual([])
    }
    // Broadcast sync writes records, revisions and changes. Secretariat sync writes groups and group_members.
    expect(JSON.parse(secretary.data).extra?.broadcastSchedule?.madeAt, 'the schedule must already be filed').toBe(midnight)
    expect(secretary.updated_at).toBe(midnight)
    const revisions = db.prepare('select at, data from revisions where record_id = ? order by seq').all(secretary.id) as { at: string; data: string }[]
    const scheduled = revisions.filter((row) => JSON.parse(row.data).extra?.broadcastSchedule !== undefined)
    expect(scheduled, 'broadcast sync must write a new agent revision').toHaveLength(1)
    expect(scheduled.flatMap((row) => [row.at, ...stampsIn(JSON.parse(row.data))]).every((at) => at === midnight)).toBe(true)
    const changes = db.prepare("select at from changes where record_id = ? and actor_type = 'system' and field = 'data.extra'").all(secretary.id) as { at: string }[]
    expect(changes, 'broadcast sync must write its system change row').toHaveLength(1)
    expect(changes.map((row) => row.at)).toEqual([midnight])
    expect(group?.opened_at, 'the group must already be filed').toBe(midnight)
    expect(members.length).toBeGreaterThan(0)
    expect(members.map((row) => ({ joined_at: row.joined_at, left_at: row.left_at }))).toEqual(members.map(() => ({ joined_at: midnight, left_at: null })))
  })

  it('leaves all four first-start writers with nothing to write in any table, including groups and memberships', () => {
    allFirstStartRows()
    const before = counts(db)
    expect(defaults.copyTheDefaultRegulationsOnce().copied).toBe(0)
    expect(words.fileTheCardWordsOnce({ full: null, why: 'This no-op must not read a commit.' }).filed).toEqual([])
    const syncedGroup = secretariat.syncTheSecretariatGroup()
    expect({ created: syncedGroup.created, added: syncedGroup.added, removed: syncedGroup.removed }).toEqual({ created: false, added: [], removed: [] })
    expect(broadcasts.syncTheBroadcastSchedules()).toEqual({ added: [], ended: [] })
    expect(counts(db)).toEqual(before)
  })

  it('leaves the database ready for the product to serve', async () => {
    const { MIGRATIONS_FOLDER, prepareToServe } = await import('../src/server/db/migrate.ts')
    const decision = prepareToServe(client.sqlite, MIGRATIONS_FOLDER)
    expect(decision.serve, JSON.stringify(decision)).toBe(true)
  })
})
