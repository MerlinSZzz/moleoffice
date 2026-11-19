// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OFFICE WHOSE ANSWERS HAVE THE SIZES THE OWNER'S OFFICE ANSWERED WITH WHEN HOME FROZE, MADE UP, FOR ROUND 19 OF WAVE 13W.
 *
 * On 9 October 2026 at 20:23 the owner opened Home and the page froze. The office's call log said what it sent:
 *   - GET /api/attention?machine=omit, the whole answer Home asks for in Developer mode: 11,767,705 bytes, its longest
 *     list 30,925 rows;
 *   - GET /api/messages/between-agents?shape=page: 1,818 conversations, 1,446,293 bytes;
 *   - GET /api/presence: 982 rows, 487,215 bytes;
 *   - GET /api/messages/contacts: 981 rows, 276,940 bytes.
 * Those are counts and sizes only. Nothing here is copied from the owner's office; every row is made up and says so.
 *
 * IT STARTS FROM tests/an-office-the-size-of-the-real-one.ts (14,000 records, 400 agents, 1,500 open runs) and adds:
 *   - made-up notes in project `default`, which carry no state word, so each is a row of the whole attention answer's
 *     list of records with no state (`noState`), the list that is 30,925 rows long in the owner's;
 *   - the chat office of tests/the-chat-office-of-the-live-shape.ts, cut to agents, the person's conversations and the
 *     conversations between agents, which is what the contact list, presence and the between-agents list read.
 * `THEIR_ANSWER_SIZES` holds the counts; tests/r19 measured what each answer then weighs and the round's report says it.
 */
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { vi } from 'vitest'
import { versionOf, contentOf } from '../src/server/lib/version.ts'
import { anOfficeTheSizeOfTheirs } from './an-office-the-size-of-the-real-one.ts'
import { LIVE_SHAPE, buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'
import { TEST_DATABASE_PREFIX } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

export const THEIR_ANSWER_SIZES = {
  /** Made-up notes with no state word, added to the 14,000 records of the office the size of the owner's. */
  notes: 15_750,
  /** Agents added to the 400 of the office the size of the owner's, so presence lists about as many as the owner's. */
  agents: 580,
  retired: 0,
  /** Messages between two agents, spread over pairs of them. */
  betweenAgents: 1_900,
} as const

/**
 * Build the office, or reuse the file already built at `keep`. Answers a copy the caller may serve and delete in its
 * own `afterAll`, after its stack has stopped.
 */
export async function anOfficeWithAnswersOfTheLiveSize(keep?: string): Promise<{ file: string; remove: () => void }> {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}answers-of-the-live-size-`)
  const file = join(dir, 'panelx.db')
  try {
    if (keep === undefined) await build(file)
    else {
      if (!existsSync(keep)) await build(keep)
      copyFileSync(keep, file)
    }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
  return { file, remove: () => rmSync(dir, { recursive: true, force: true }) }
}

async function build(keep: string): Promise<void> {
  const base = await anOfficeTheSizeOfTheirs()
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}answers-of-the-live-size-build-`)
  const file = join(dir, 'panelx.db')
  copyFileSync(base.file, file)
  base.remove()
  vi.resetModules()
  process.env.MOLE_OFFICE_DB = file
  const client = await import('../src/server/db/client.ts')
  try {
    const sqlite = client.sqlite
    // THE NOTES, each a copy of one made-up note with its create change and first revision, as the office the size of
    // the owner's makes its records.
    const template = sqlite.prepare("SELECT id, kind, summary, data FROM records WHERE kind = 'note' AND workspace_id = 'default' AND title = 'Made-up record 2'").get() as { id: string; kind: string; summary: string | null; data: string } | undefined
    if (template === undefined) throw new Error('The office at the person’s size has no made-up note to copy.')
    const copy = (table: string, replacements: Record<string, string>, where: string) => {
      const columns = (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((one) => one.name)
      return sqlite.prepare(`INSERT INTO ${table} (${columns.join(',')}) SELECT ${columns.map((column) => replacements[column] ?? column).join(',')} FROM ${table} WHERE ${where}`)
    }
    const recordCopy = copy('records', { id: '@id', title: '@title' }, 'id = @template')
    const changeCopy = copy('changes', { id: '@change', record_id: '@id', new_value: '@title', append_order: 'NULL' }, "record_id = @template AND op = 'create'")
    const revisionCopy = copy('revisions', { id: '@revision', record_id: '@id', title: '@title', content_hash: '@hash' }, 'record_id = @template AND seq = 1')
    sqlite.transaction(() => {
      for (let i = 0; i < THEIR_ANSWER_SIZES.notes; i += 1) {
        const title = `Made-up note with no state ${String(i + 1)}`
        const hash = versionOf(contentOf({ kind: template.kind, title, summary: template.summary, data: JSON.parse(template.data), deletedAt: null }))
        const values = { id: randomUUID(), title, template: template.id, change: randomUUID(), revision: randomUUID(), hash }
        recordCopy.run(values)
        changeCopy.run(values)
        revisionCopy.run(values)
      }
    })()
    buildTheChatOffice(sqlite, THE_PERSON, {
      ...LIVE_SHAPE,
      agents: THEIR_ANSWER_SIZES.agents,
      retired: THEIR_ANSWER_SIZES.retired,
      betweenAgents: THEIR_ANSWER_SIZES.betweenAgents,
      theConversation: 50,
      otherPersonMessages: 150,
      groups: 0,
      groupsWithThePerson: 0,
      groupMessages: 0,
      officeLines: 0,
      sessions: 0,
      otherRecords: 0,
    })
    // THE CHAT OFFICE WRITES ITS ROWS STRAIGHT INTO THE TABLES, as the doors would have written them before the data
    // steps of the migrations ran; a server refuses to serve a file those steps would still write to. They are run
    // here, on this made-up file, before it is kept.
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    migrateInPlace(sqlite)
    sqlite.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(file, keep)
  } finally {
    client.sqlite.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
